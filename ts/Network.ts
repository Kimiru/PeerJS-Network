import Peer, { PeerErrorType } from "peerjs"
import NetworkConnection from "./NetworkConnexion.js"
import NetworkEvents from "./NetworkEvents.js"

declare global {
    interface Window {
        Peer: typeof Peer
    }
}

/**
 * The Network class uses PeerJS to manage P2P connection.
 * On top of peerjs it manages timeouts conditional hosting (whitelist blacklist)
 *    and auto rejection against unwanted connections.
 */
export class Network {

    static peer: any = null
    static id: string = null
    static isHosting: boolean = false
    static maxClient: number = 15

    static acceptConnections: boolean = true
    static useWhitelist: boolean = true
    static whitelist: string[] = []
    static blacklist: string[] = []

    static connections: Map<string, NetworkConnection> = new Map()

    static callbacks: Map<NetworkEvents, ((data: any) => void)[]> = new Map()

    /**
     * Returns true if SimplePeer is defined in the window object
     * This value should be defined by default by the simple-peer implementaton
     * 
     * @returns {boolean}
     */
    static enabled(): boolean { return window.Peer != null }

    /**
     * Throw an error if Network.enabled returns false
     */
    static assertEnabled() { if (!Network.enabled()) throw new Error('PeerJS must be included and defined in window.Peer for Network functionalities to work') }

    /**
     * Returns true if there is any connection currenlty active
     * 
     * @returns {boolean}
     */
    static hasConnections(): boolean { return Network.connections.size !== 0 }

    /**
     * Returns true if the network is hosting and the number of connection currently active is at least equal to Network.maxClient
     * 
     * @returns {boolean}
     */
    static isFull(): boolean { return Network.connections.size >= Network.maxClient }

    /**
     * Connect to the signaling server 
     * 
     * @param {string} id 
     * @param {any} options see peerjs documentation for Peer options
     */
    static start(id: string, options: any = undefined): any {


        let peer = new window.Peer(id, options)

        peer.on('open', () => {

            Network.peer = peer;
            Network.id = peer.id

            for (let callback of Network.getCallbacks(NetworkEvents.PEER_OPENED))
                callback.call(Network, Network.id)

        })

        peer.on('connection', (conn) => {

            let networkConnection = new NetworkConnection(conn, true)

            this.connections.set(networkConnection.id, networkConnection)

            for (let callback of Network.getCallbacks(NetworkEvents.PEER_CONNECTION))
                callback.call(Network, networkConnection)
        })

        peer.on('close', () => {

            for (let callback of Network.getCallbacks(NetworkEvents.PEER_CLOSED))
                callback.call(Network)

        })

        peer.on('error',
            (error) => {

                if ((error as any).type === 'unavailable-id')
                    for (let callback of Network.getCallbacks(NetworkEvents.UNAVAILABLE_ID))
                        callback.call(Network)

                else if ((error as any).type === 'invalid-id')
                    for (let callback of Network.getCallbacks(NetworkEvents.INVALID_ID))
                        callback.call(Network)

                else for (let callback of Network.getCallbacks(NetworkEvents.PEER_ERROR))
                    callback.call(Network, error)

            })

        peer.on('disconnected', () => {

            for (let callback of Network.getCallbacks(NetworkEvents.PEER_DISCONNECT))
                callback.call(Network)

        })

    }


    static reconnect(): void {

        if (Network.peer && Network.peer.disconnected) Network.peer.reconnect()

    }

    /**
     * Enable hosting, if any connection is opened at time, 
     * uses abortIfConnections to determined if those connections should be closed and the operation should proceed
     * Returns the new state of isHosting
     * 
     * @param {boolean} abortIfConnections 
     * @returns {boolean} 
     */
    static enableHosting(abortIfConnections: boolean = false): boolean {

        if (!Network.isHosting)
            if (!Network.hasConnections() || !abortIfConnections) {

                this.isHosting = true
                Network.closeAllConnections()

            }



        return this.isHosting

    }

    /**
     * Disable hosting, if any connection is opened at time, 
     * uses abortIfConnections to determined if those connections should be closed and the operation should proceed.
     * Returns the new state of isHosting.
     * 
     * @param {boolean} abortIfConnections 
     * @returns {boolean} 
     */
    static disableHosting(abortIfConnections: boolean = false): boolean {

        if (Network.isHosting)
            if (!Network.hasConnections() || !abortIfConnections) {

                Network.closeAllConnections()
                this.isHosting = false

            }

        return this.isHosting

    }

    /**
     * Tries to connect to a given peer.
     * will throw an error if not connected to the signaling server or currently hosting.
     * Will automaticaly store the connectino into Network.connections.
     * Will throw an error if you are already connected to a peer.
     * 
     * @param {string} id 
     * @returns {NetworkConnection}
     */
    static connectTo(id: string): NetworkConnection {

        if (id === this.id) throw `You can't connect to yourself`
        if (!Network.peer) throw `You can't connect to somebody without starting the Network and being connected to the signaling server`
        if (Network.isHosting) throw `You can't connect to somebody while hosting`
        if (Network.hasConnections()) throw `You can only connect to one peer at a time`

        let networkConnection = new NetworkConnection(Network.peer.connect(id), false)

        Network.connections.set(networkConnection.id, networkConnection)

        return networkConnection

    }

    /**
     * Send any data to a given connected peer if it exists
     * 
     * @param {string} id 
     * @param {any} data 
     */
    static sendTo(id: string, data: any): void {

        Network.connections.get(id)?.connection.send(data)

    }

    /**
     * Send any data to every connected peer
     * 
     * @param {any} data 
     */
    static sendToAll(data: any): void {

        for (let connection of Network.connections)
            connection[1].connection.send(data)

    }

    /**
     * Send any data to every connected peer except a given one
     * 
     * @param {string} id 
     * @param {any} data 
     */
    static sendToAllExcept(id: string, data: any): void {

        for (let connection of Network.connections) if (connection[0] !== id)
            connection[1].connection.send(data)

    }

    /**
     * Close the connection to a given peer if it exists
     * 
     * @param {string} id 
     */
    static closeConnection(id: string): void {

        Network.connections.get(id)?.cleanclose()

    }

    /**
     * Close the connection with all connected peer
     */
    static closeAllConnections(): void {

        for (let connection of Network.connections)
            connection[1].cleanclose()

    }

    /**
     * Add a callback for a given event
     * 
     * @param {NetworkEvents} event 
     * @param callback 
     */
    static on(event: NetworkEvents, callback: (data: any) => void): void {

        if (!Network.callbacks.has(event))
            Network.callbacks.set(event, [])

        Network.callbacks.get(event).push(callback)

    }

    /**
     * Returns all callbacks associated with the given event
     * 
     * @param {NetworkEvents} event 
     * @returns {((data:any)=>void)[]}
     */
    static getCallbacks(event: NetworkEvents): ((data: any) => void)[] {
        return Network.callbacks.get(event) ?? []
    }

    /**
     * Puts a given id into the whitelist
     * 
     * @param {string} id 
     */
    static allow(id: string): void {

        Network.whitelist.push(id)

    }

    /**
     * Removes a given id from the whitelist, closing the connection if it exists
     * 
     * @param {string} id 
     */
    static deny(id: string): void {

        let index = Network.whitelist.indexOf(id)

        if (index !== -1)
            Network.whitelist.splice(index, 1)

        if (this.useWhitelist && this.isHosting)
            Network.connections.get(id)?.cleanclose()

    }

    /**
     * Puts a given id into the blacklist, closing the connection if it exists
     * 
     * @param {string} id 
     */
    static ban(id: string): void {

        Network.blacklist.push(id)

        Network.connections.get(id)?.cleanclose()

    }

    /**
     * Removes a given id from the blacklist
     * 
     * @param {string} id 
     */
    static unban(id: string): void {

        let index = Network.blacklist.indexOf(id)

        if (index !== -1)
            Network.blacklist.splice(index, 1)

    }

}
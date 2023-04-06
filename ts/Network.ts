import Peer, { PeerJSOption } from "peerjs"
import '../node_modules/peerjs/dist/peerjs.min.js'

declare global {
    interface Window {
        Peer: typeof Peer
    }
}

export enum NetworkEvent {

    PEER_OPENED,  // id has been obtained
    UNAVAILABLE_ID,  // id could not be obtained
    INVALID_ID, // id is invalid
    PEER_CONNECTION,// A user is connecting to you
    PEER_CLOSED, // When peer is destroyed
    PEER_DISCONNECT, // Disconnected from signaling server
    PEER_ERROR, // Fatal errors moslty

    HOST_P2P_OPENED, // A connexion has been opened on the host/server side
    HOST_P2P_CLOSED,  // A connexion has been closed on the host/server side
    HOST_P2P_RECEIVED_DATA,

    CLIENT_P2P_OPENED,
    CLIENT_P2P_CLOSED,
    CLIENT_P2P_RECEIVED_DATA,
    CLIENT_P2P_CONFIRMED_CONNECTION,

    HOSTING_START,
    HOSTING_END,

}

/**
 * The Network class uses PeerJS to manage P2P connection.
 * On top of peerjs it manages timeouts conditional hosting (whitelist blacklist)
 *    and auto rejection against unwanted connections.
 */
export class Network {

    peer: Peer | null = null
    id: string | null = null
    isHosting: boolean = false
    maxClient: number = 15

    acceptConnections: boolean = true
    useWhitelist: boolean = true
    whitelist: string[] = []
    blacklist: string[] = []

    connections: Map<string, NetworkConnection> = new Map()

    callbacks: Map<NetworkEvent, ((data: any) => void)[]> = new Map()

    /**
     * Returns true if there is any connection currenlty active
     */
    hasConnections(): boolean { return this.connections.size !== 0 }

    /**
     * Returns true if the network is hosting and the number of connection currently active is at least equal to this.maxClient
     */
    isFull(): boolean { return this.connections.size >= this.maxClient }

    /**
     * Connect to the signaling server 
     */
    start(id: string, options: PeerJSOption = {}): any {

        let peer = new window.Peer(id, options)

        peer.on('open', () => {

            this.peer = peer
            this.id = peer.id

            for (let callback of this.getCallbacks(NetworkEvent.PEER_OPENED))
                callback.call(Network, this.id)

        })

        peer.on('connection', (conn) => {

            let networkConnection = new NetworkConnection(conn, true, this)

            this.connections.set(networkConnection.id, networkConnection)

            for (let callback of this.getCallbacks(NetworkEvent.PEER_CONNECTION))
                callback.call(Network, networkConnection)
        })

        peer.on('close', () => {

            for (let callback of this.getCallbacks(NetworkEvent.PEER_CLOSED))
                callback.call(Network)

        })

        peer.on('error',
            (error) => {

                if ((error as any).type === 'unavailable-id')
                    for (let callback of this.getCallbacks(NetworkEvent.UNAVAILABLE_ID))
                        callback.call(Network)

                else if ((error as any).type === 'invalid-id')
                    for (let callback of this.getCallbacks(NetworkEvent.INVALID_ID))
                        callback.call(Network)

                else for (let callback of this.getCallbacks(NetworkEvent.PEER_ERROR))
                    callback.call(Network, error)

            })

        peer.on('disconnected', () => {

            for (let callback of this.getCallbacks(NetworkEvent.PEER_DISCONNECT))
                callback.call(Network)

        })

    }

    reconnect(): void {

        if (this.peer && this.peer.disconnected) this.peer.reconnect()

    }

    /**
     * Enable hosting, if any connection is opened at time, 
     * uses abortIfConnections to determined if those connections should be closed and the operation should proceed
     * Returns the new state of isHosting
     */
    enableHosting(abortIfConnections: boolean = false): boolean {

        if (!this.isHosting)
            if (!this.hasConnections() || !abortIfConnections) {

                this.isHosting = true
                this.closeAllConnections()

            }



        return this.isHosting

    }

    /**
     * Disable hosting, if any connection is opened at time, 
     * uses abortIfConnections to determined if those connections should be closed and the operation should proceed.
     * Returns the new state of isHosting.
     */
    disableHosting(abortIfConnections: boolean = false): boolean {

        if (this.isHosting)
            if (!this.hasConnections() || !abortIfConnections) {

                this.closeAllConnections()
                this.isHosting = false

            }

        return this.isHosting

    }

    /**
     * Tries to connect to a given peer.
     * will throw an error if not connected to the signaling server or currently hosting.
     * Will automaticaly store the connectino into this.connections.
     * Will throw an error if you are already connected to a peer.
     */
    connectTo(id: string): NetworkConnection {

        if (id === this.id) throw `You can't connect to yourself`
        if (!this.peer) throw `You can't connect to somebody without starting the Network and being connected to the signaling server`
        if (this.isHosting) throw `You can't connect to somebody while hosting`
        if (this.hasConnections()) throw `You can only connect to one peer at a time`

        let networkConnection = new NetworkConnection(this.peer.connect(id), false, this)

        this.connections.set(networkConnection.id, networkConnection)

        return networkConnection

    }

    /**
     * Send any data to a given connected peer if it exists
     * 
     * @param {string} id 
     * @param {any} data 
     */
    sendTo(id: string, data: any): void {

        this.connections.get(id)?.connection.send(data)

    }

    /**
     * Send any data to every connected peer
     * 
     * @param {any} data 
     */
    sendToAll(data: any): void {

        for (let connection of this.connections)
            connection[1].connection.send(data)

    }

    /**
     * Send any data to every connected peer except a given one
     * 
     * @param {string} id 
     * @param {any} data 
     */
    sendToAllExcept(id: string, data: any): void {

        for (let connection of this.connections) if (connection[0] !== id)
            connection[1].connection.send(data)

    }

    /**
     * Close the connection to a given peer if it exists
     * 
     * @param {string} id 
     */
    closeConnection(id: string): void {

        this.connections.get(id)?.cleanclose()

    }

    /**
     * Close the connection with all connected peer
     */
    closeAllConnections(): void {

        for (let connection of this.connections)
            connection[1].cleanclose()

    }

    /**
     * Add a callback for a given event
     * 
     * @param {NetworkEvent} event 
     * @param callback 
     */
    on(event: NetworkEvent, callback: (data: any) => void): void {

        if (!this.callbacks.has(event))
            this.callbacks.set(event, [])

        this.callbacks.get(event)?.push(callback)

    }

    /**
     * Returns all callbacks associated with the given event
     */
    getCallbacks(event: NetworkEvent): ((data: any) => void)[] {
        return this.callbacks.get(event) ?? []
    }

    /**
     * Puts a given id into the whitelist
     */
    allow(id: string): void {

        this.whitelist.push(id)

    }

    /**
     * Removes a given id from the whitelist, closing the connection if it exists
     */
    deny(id: string): void {

        let index = this.whitelist.indexOf(id)

        if (index !== -1)
            this.whitelist.splice(index, 1)

        if (this.useWhitelist && this.isHosting)
            this.connections.get(id)?.cleanclose()

    }

    /**
     * Puts a given id into the blacklist, closing the connection if it exists
     */
    ban(id: string): void {

        this.blacklist.push(id)

        this.connections.get(id)?.cleanclose()

    }

    /**
     * Removes a given id from the blacklist
     */
    unban(id: string): void {

        let index = this.blacklist.indexOf(id)

        if (index !== -1)
            this.blacklist.splice(index, 1)

    }

}

export class NetworkConnection {

    connection: any
    timer: Timer = new Timer()
    intervalID: number
    receiver: boolean
    network: Network

    constructor(connection: any, receiver: boolean, network: Network) {

        this.connection = connection
        this.receiver = receiver
        this.network = network

        this.intervalID = window.setInterval(this.#timeout.bind(this), 1000)

        this.connection.on('open', this.#open.bind(this))
        this.connection.on('close', this.#close.bind(this))
        this.connection.on('data', this.#data.bind(this))

    }

    #timeout(): void {

        if (this.timer.greaterThan(6000)) {

            this.cleanclose()

            // console.log(`Connection with "${this.id}" timed out`)

        } else
            this.connection.send('Network$IAMHERE')

    }

    #open(): void {

        // console.log(`connection opened with ${this.id}`)

        if (this.receiver) {

            if (!this.network.isHosting || !this.network.acceptConnections ||
                this.network.isFull() ||
                this.network.blacklist.includes(this.id) ||
                this.network.useWhitelist && !this.network.whitelist.includes(this.id)) {

                this.cleanclose()

            } else {

                for (let callback of this.network.getCallbacks(NetworkEvent.HOST_P2P_OPENED))
                    callback.call(this)

                this.connection.send('Network$CONFIRM')

            }


        } else {

            for (let callback of this.network.getCallbacks(NetworkEvent.CLIENT_P2P_OPENED))
                callback.call(this)

        }

    }

    #close(): void {

        // console.log(`connection closed with ${this.id}`)

        if (this.receiver) {

            for (let callback of this.network.getCallbacks(NetworkEvent.HOST_P2P_CLOSED))
                callback.call(this)

        } else {

            for (let callback of this.network.getCallbacks(NetworkEvent.CLIENT_P2P_CLOSED))
                callback.call(this)

        }

        this.clean()

    }

    #data(data: any): void {

        this.timer.reset()

        if (data === 'Network$CLOSE')
            this.cleanclose()

        else if (data === 'Network$IAMHERE')
            return

        else if (data === 'Network$CONFIRM' && !this.receiver)
            for (let callback of this.network.getCallbacks(NetworkEvent.CLIENT_P2P_CONFIRMED_CONNECTION))
                callback.call(this, data)

        else
            if (this.receiver)
                for (let callback of this.network.getCallbacks(NetworkEvent.HOST_P2P_RECEIVED_DATA))
                    callback.call(this, data)

            else
                for (let callback of this.network.getCallbacks(NetworkEvent.CLIENT_P2P_RECEIVED_DATA))
                    callback.call(this, data)




    }

    get id() { return this.connection.peer }

    /**
     * Removes the connection from Network.connections and deletes the timeout interval
     */
    clean(): void {

        clearInterval(this.intervalID)

        this.network.connections.delete(this.id)

    }

    /**
     * Sends a closing message to the connected peer and closes the connection with it
     */
    close(): void {

        this.connection.send('Network$CLOSE')

        setTimeout(() => { this.connection.close() }, 250)

    }

    /**
     * Execute the function this.clean() and this.close()
     */
    cleanclose() {

        this.clean()
        this.close()

    }

}

/**
 * The Timer class is used to mesure time easily
 */
export class Timer {

    begin: number

    /**
     * Create a new timer starting from now or a given setpoint
     * 
     * @param time 
     */
    constructor(time = Date.now()) {

        this.begin = time

    }

    /**
     * Reset the timer
     */
    reset(): void {

        this.begin = Date.now()

    }

    /**
     * Return the amount of time in ms since the timer was last reset
     */
    getTime(): number {

        return Date.now() - this.begin

    }

    /**
     * Return true if the time since the last reset is greather that the given amount in ms
     * 
     * @param {number} amount in ms
     */
    greaterThan(amount: number): boolean {

        return this.getTime() > amount

    }

    /**
     * Return true if the time since the last reset is less that the given amount in ms
     * 
     * @param {number} amount 
     */
    lessThan(amount: number): boolean {

        return this.getTime() < amount

    }

}
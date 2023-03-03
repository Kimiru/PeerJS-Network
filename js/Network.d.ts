import Peer, { PeerJSOption } from "peerjs";
import '../node_modules/peerjs/dist/peerjs.min.js';
declare global {
    interface Window {
        Peer: typeof Peer;
    }
}
export declare enum NetworkEvent {
    PEER_OPENED = 0,
    UNAVAILABLE_ID = 1,
    INVALID_ID = 2,
    PEER_CONNECTION = 3,
    PEER_CLOSED = 4,
    PEER_DISCONNECT = 5,
    PEER_ERROR = 6,
    HOST_P2P_OPENED = 7,
    HOST_P2P_CLOSED = 8,
    HOST_P2P_RECEIVED_DATA = 9,
    CLIENT_P2P_OPENED = 10,
    CLIENT_P2P_CLOSED = 11,
    CLIENT_P2P_RECEIVED_DATA = 12,
    CLIENT_P2P_CONFIRMED_CONNECTION = 13,
    HOSTING_START = 14,
    HOSTING_END = 15
}
/**
 * The Network class uses PeerJS to manage P2P connection.
 * On top of peerjs it manages timeouts conditional hosting (whitelist blacklist)
 *    and auto rejection against unwanted connections.
 */
export declare class Network {
    static peer: Peer;
    static id: string;
    static isHosting: boolean;
    static maxClient: number;
    static acceptConnections: boolean;
    static useWhitelist: boolean;
    static whitelist: string[];
    static blacklist: string[];
    static connections: Map<string, NetworkConnection>;
    static callbacks: Map<NetworkEvent, ((data: any) => void)[]>;
    /**
     * Returns true if there is any connection currenlty active
     *
     * @returns {boolean}
     */
    static hasConnections(): boolean;
    /**
     * Returns true if the network is hosting and the number of connection currently active is at least equal to Network.maxClient
     *
     * @returns {boolean}
     */
    static isFull(): boolean;
    /**
     * Connect to the signaling server
     *
     * @param {string} id
     * @param {any} options see peerjs documentation for Peer options
     */
    static start(id: string, options?: PeerJSOption): any;
    static reconnect(): void;
    /**
     * Enable hosting, if any connection is opened at time,
     * uses abortIfConnections to determined if those connections should be closed and the operation should proceed
     * Returns the new state of isHosting
     *
     * @param {boolean} abortIfConnections
     * @returns {boolean}
     */
    static enableHosting(abortIfConnections?: boolean): boolean;
    /**
     * Disable hosting, if any connection is opened at time,
     * uses abortIfConnections to determined if those connections should be closed and the operation should proceed.
     * Returns the new state of isHosting.
     *
     * @param {boolean} abortIfConnections
     * @returns {boolean}
     */
    static disableHosting(abortIfConnections?: boolean): boolean;
    /**
     * Tries to connect to a given peer.
     * will throw an error if not connected to the signaling server or currently hosting.
     * Will automaticaly store the connectino into Network.connections.
     * Will throw an error if you are already connected to a peer.
     *
     * @param {string} id
     * @returns {NetworkConnection}
     */
    static connectTo(id: string): NetworkConnection;
    /**
     * Send any data to a given connected peer if it exists
     *
     * @param {string} id
     * @param {any} data
     */
    static sendTo(id: string, data: any): void;
    /**
     * Send any data to every connected peer
     *
     * @param {any} data
     */
    static sendToAll(data: any): void;
    /**
     * Send any data to every connected peer except a given one
     *
     * @param {string} id
     * @param {any} data
     */
    static sendToAllExcept(id: string, data: any): void;
    /**
     * Close the connection to a given peer if it exists
     *
     * @param {string} id
     */
    static closeConnection(id: string): void;
    /**
     * Close the connection with all connected peer
     */
    static closeAllConnections(): void;
    /**
     * Add a callback for a given event
     *
     * @param {NetworkEvent} event
     * @param callback
     */
    static on(event: NetworkEvent, callback: (data: any) => void): void;
    /**
     * Returns all callbacks associated with the given event
     *
     * @param {NetworkEvent} event
     * @returns {((data:any)=>void)[]}
     */
    static getCallbacks(event: NetworkEvent): ((data: any) => void)[];
    /**
     * Puts a given id into the whitelist
     *
     * @param {string} id
     */
    static allow(id: string): void;
    /**
     * Removes a given id from the whitelist, closing the connection if it exists
     *
     * @param {string} id
     */
    static deny(id: string): void;
    /**
     * Puts a given id into the blacklist, closing the connection if it exists
     *
     * @param {string} id
     */
    static ban(id: string): void;
    /**
     * Removes a given id from the blacklist
     *
     * @param {string} id
     */
    static unban(id: string): void;
}
export declare class NetworkConnection {
    #private;
    connection: any;
    timer: Timer;
    intervalID: number;
    receiver: boolean;
    constructor(connection: any, receiver: boolean);
    get id(): any;
    /**
     * Removes the connection from Network.connections and deletes the timeout interval
     */
    clean(): void;
    /**
     * Sends a closing message to the connected peer and closes the connection with it
     */
    close(): void;
    /**
     * Execute the function this.clean() and this.close()
     */
    cleanclose(): void;
}
/**
 * The Timer class is used to mesure time easily
 */
export declare class Timer {
    begin: number;
    /**
     * Create a new timer starting from now or a given setpoint
     *
     * @param time
     */
    constructor(time?: number);
    /**
     * Reset the timer
     */
    reset(): void;
    /**
     * Return the amount of time in ms since the timer was last reset
     */
    getTime(): number;
    /**
     * Return true if the time since the last reset is greather that the given amount in ms
     *
     * @param {number} amount in ms
     */
    greaterThan(amount: number): boolean;
    /**
     * Return true if the time since the last reset is less that the given amount in ms
     *
     * @param {number} amount
     */
    lessThan(amount: number): boolean;
}

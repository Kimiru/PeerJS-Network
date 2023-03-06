import '../node_modules/peerjs/dist/peerjs.min.js';
export var NetworkEvent;
(function (NetworkEvent) {
    NetworkEvent[NetworkEvent["PEER_OPENED"] = 0] = "PEER_OPENED";
    NetworkEvent[NetworkEvent["UNAVAILABLE_ID"] = 1] = "UNAVAILABLE_ID";
    NetworkEvent[NetworkEvent["INVALID_ID"] = 2] = "INVALID_ID";
    NetworkEvent[NetworkEvent["PEER_CONNECTION"] = 3] = "PEER_CONNECTION";
    NetworkEvent[NetworkEvent["PEER_CLOSED"] = 4] = "PEER_CLOSED";
    NetworkEvent[NetworkEvent["PEER_DISCONNECT"] = 5] = "PEER_DISCONNECT";
    NetworkEvent[NetworkEvent["PEER_ERROR"] = 6] = "PEER_ERROR";
    NetworkEvent[NetworkEvent["HOST_P2P_OPENED"] = 7] = "HOST_P2P_OPENED";
    NetworkEvent[NetworkEvent["HOST_P2P_CLOSED"] = 8] = "HOST_P2P_CLOSED";
    NetworkEvent[NetworkEvent["HOST_P2P_RECEIVED_DATA"] = 9] = "HOST_P2P_RECEIVED_DATA";
    NetworkEvent[NetworkEvent["CLIENT_P2P_OPENED"] = 10] = "CLIENT_P2P_OPENED";
    NetworkEvent[NetworkEvent["CLIENT_P2P_CLOSED"] = 11] = "CLIENT_P2P_CLOSED";
    NetworkEvent[NetworkEvent["CLIENT_P2P_RECEIVED_DATA"] = 12] = "CLIENT_P2P_RECEIVED_DATA";
    NetworkEvent[NetworkEvent["CLIENT_P2P_CONFIRMED_CONNECTION"] = 13] = "CLIENT_P2P_CONFIRMED_CONNECTION";
    NetworkEvent[NetworkEvent["HOSTING_START"] = 14] = "HOSTING_START";
    NetworkEvent[NetworkEvent["HOSTING_END"] = 15] = "HOSTING_END";
})(NetworkEvent || (NetworkEvent = {}));
/**
 * The Network class uses PeerJS to manage P2P connection.
 * On top of peerjs it manages timeouts conditional hosting (whitelist blacklist)
 *    and auto rejection against unwanted connections.
 */
export class Network {
    static peer = null;
    static id = null;
    static isHosting = false;
    static maxClient = 15;
    static acceptConnections = true;
    static useWhitelist = true;
    static whitelist = [];
    static blacklist = [];
    static connections = new Map();
    static callbacks = new Map();
    /**
     * Returns true if there is any connection currenlty active
     */
    static hasConnections() { return Network.connections.size !== 0; }
    /**
     * Returns true if the network is hosting and the number of connection currently active is at least equal to Network.maxClient
     */
    static isFull() { return Network.connections.size >= Network.maxClient; }
    /**
     * Connect to the signaling server
     */
    static start(id, options = {}) {
        let peer = new window.Peer(id, options);
        peer.on('open', () => {
            Network.peer = peer;
            Network.id = peer.id;
            for (let callback of Network.getCallbacks(NetworkEvent.PEER_OPENED))
                callback.call(Network, Network.id);
        });
        peer.on('connection', (conn) => {
            let networkConnection = new NetworkConnection(conn, true);
            this.connections.set(networkConnection.id, networkConnection);
            for (let callback of Network.getCallbacks(NetworkEvent.PEER_CONNECTION))
                callback.call(Network, networkConnection);
        });
        peer.on('close', () => {
            for (let callback of Network.getCallbacks(NetworkEvent.PEER_CLOSED))
                callback.call(Network);
        });
        peer.on('error', (error) => {
            if (error.type === 'unavailable-id')
                for (let callback of Network.getCallbacks(NetworkEvent.UNAVAILABLE_ID))
                    callback.call(Network);
            else if (error.type === 'invalid-id')
                for (let callback of Network.getCallbacks(NetworkEvent.INVALID_ID))
                    callback.call(Network);
            else
                for (let callback of Network.getCallbacks(NetworkEvent.PEER_ERROR))
                    callback.call(Network, error);
        });
        peer.on('disconnected', () => {
            for (let callback of Network.getCallbacks(NetworkEvent.PEER_DISCONNECT))
                callback.call(Network);
        });
    }
    static reconnect() {
        if (Network.peer && Network.peer.disconnected)
            Network.peer.reconnect();
    }
    /**
     * Enable hosting, if any connection is opened at time,
     * uses abortIfConnections to determined if those connections should be closed and the operation should proceed
     * Returns the new state of isHosting
     */
    static enableHosting(abortIfConnections = false) {
        if (!Network.isHosting)
            if (!Network.hasConnections() || !abortIfConnections) {
                this.isHosting = true;
                Network.closeAllConnections();
            }
        return this.isHosting;
    }
    /**
     * Disable hosting, if any connection is opened at time,
     * uses abortIfConnections to determined if those connections should be closed and the operation should proceed.
     * Returns the new state of isHosting.
     */
    static disableHosting(abortIfConnections = false) {
        if (Network.isHosting)
            if (!Network.hasConnections() || !abortIfConnections) {
                Network.closeAllConnections();
                this.isHosting = false;
            }
        return this.isHosting;
    }
    /**
     * Tries to connect to a given peer.
     * will throw an error if not connected to the signaling server or currently hosting.
     * Will automaticaly store the connectino into Network.connections.
     * Will throw an error if you are already connected to a peer.
     */
    static connectTo(id) {
        if (id === this.id)
            throw `You can't connect to yourself`;
        if (!Network.peer)
            throw `You can't connect to somebody without starting the Network and being connected to the signaling server`;
        if (Network.isHosting)
            throw `You can't connect to somebody while hosting`;
        if (Network.hasConnections())
            throw `You can only connect to one peer at a time`;
        let networkConnection = new NetworkConnection(Network.peer.connect(id), false);
        Network.connections.set(networkConnection.id, networkConnection);
        return networkConnection;
    }
    /**
     * Send any data to a given connected peer if it exists
     *
     * @param {string} id
     * @param {any} data
     */
    static sendTo(id, data) {
        Network.connections.get(id)?.connection.send(data);
    }
    /**
     * Send any data to every connected peer
     *
     * @param {any} data
     */
    static sendToAll(data) {
        for (let connection of Network.connections)
            connection[1].connection.send(data);
    }
    /**
     * Send any data to every connected peer except a given one
     *
     * @param {string} id
     * @param {any} data
     */
    static sendToAllExcept(id, data) {
        for (let connection of Network.connections)
            if (connection[0] !== id)
                connection[1].connection.send(data);
    }
    /**
     * Close the connection to a given peer if it exists
     *
     * @param {string} id
     */
    static closeConnection(id) {
        Network.connections.get(id)?.cleanclose();
    }
    /**
     * Close the connection with all connected peer
     */
    static closeAllConnections() {
        for (let connection of Network.connections)
            connection[1].cleanclose();
    }
    /**
     * Add a callback for a given event
     *
     * @param {NetworkEvent} event
     * @param callback
     */
    static on(event, callback) {
        if (!Network.callbacks.has(event))
            Network.callbacks.set(event, []);
        Network.callbacks.get(event)?.push(callback);
    }
    /**
     * Returns all callbacks associated with the given event
     */
    static getCallbacks(event) {
        return Network.callbacks.get(event) ?? [];
    }
    /**
     * Puts a given id into the whitelist
     */
    static allow(id) {
        Network.whitelist.push(id);
    }
    /**
     * Removes a given id from the whitelist, closing the connection if it exists
     */
    static deny(id) {
        let index = Network.whitelist.indexOf(id);
        if (index !== -1)
            Network.whitelist.splice(index, 1);
        if (this.useWhitelist && this.isHosting)
            Network.connections.get(id)?.cleanclose();
    }
    /**
     * Puts a given id into the blacklist, closing the connection if it exists
     */
    static ban(id) {
        Network.blacklist.push(id);
        Network.connections.get(id)?.cleanclose();
    }
    /**
     * Removes a given id from the blacklist
     */
    static unban(id) {
        let index = Network.blacklist.indexOf(id);
        if (index !== -1)
            Network.blacklist.splice(index, 1);
    }
}
export class NetworkConnection {
    connection;
    timer = new Timer();
    intervalID;
    receiver;
    constructor(connection, receiver) {
        this.connection = connection;
        this.receiver = receiver;
        this.intervalID = window.setInterval(this.#timeout.bind(this), 1000);
        this.connection.on('open', this.#open.bind(this));
        this.connection.on('close', this.#close.bind(this));
        this.connection.on('data', this.#data.bind(this));
    }
    #timeout() {
        if (this.timer.greaterThan(6000)) {
            this.cleanclose();
            // console.log(`Connection with "${this.id}" timed out`)
        }
        else
            this.connection.send('Network$IAMHERE');
    }
    #open() {
        // console.log(`connection opened with ${this.id}`)
        if (this.receiver) {
            if (!Network.isHosting || !Network.acceptConnections ||
                Network.isFull() ||
                Network.blacklist.includes(this.id) ||
                Network.useWhitelist && !Network.whitelist.includes(this.id)) {
                this.cleanclose();
            }
            else {
                for (let callback of Network.getCallbacks(NetworkEvent.HOST_P2P_OPENED))
                    callback.call(this);
                this.connection.send('Network$CONFIRM');
            }
        }
        else {
            for (let callback of Network.getCallbacks(NetworkEvent.CLIENT_P2P_OPENED))
                callback.call(this);
        }
    }
    #close() {
        // console.log(`connection closed with ${this.id}`)
        if (this.receiver) {
            for (let callback of Network.getCallbacks(NetworkEvent.HOST_P2P_CLOSED))
                callback.call(this);
        }
        else {
            for (let callback of Network.getCallbacks(NetworkEvent.CLIENT_P2P_CLOSED))
                callback.call(this);
        }
        this.clean();
    }
    #data(data) {
        this.timer.reset();
        if (data === 'Network$CLOSE')
            this.cleanclose();
        else if (data === 'Network$IAMHERE')
            return;
        else if (data === 'Network$CONFIRM' && !this.receiver)
            for (let callback of Network.getCallbacks(NetworkEvent.CLIENT_P2P_CONFIRMED_CONNECTION))
                callback.call(this, data);
        else if (this.receiver)
            for (let callback of Network.getCallbacks(NetworkEvent.HOST_P2P_RECEIVED_DATA))
                callback.call(this, data);
        else
            for (let callback of Network.getCallbacks(NetworkEvent.CLIENT_P2P_RECEIVED_DATA))
                callback.call(this, data);
    }
    get id() { return this.connection.peer; }
    /**
     * Removes the connection from Network.connections and deletes the timeout interval
     */
    clean() {
        clearInterval(this.intervalID);
        Network.connections.delete(this.id);
    }
    /**
     * Sends a closing message to the connected peer and closes the connection with it
     */
    close() {
        this.connection.send('Network$CLOSE');
        setTimeout(() => { this.connection.close(); }, 250);
    }
    /**
     * Execute the function this.clean() and this.close()
     */
    cleanclose() {
        this.clean();
        this.close();
    }
}
/**
 * The Timer class is used to mesure time easily
 */
export class Timer {
    begin;
    /**
     * Create a new timer starting from now or a given setpoint
     *
     * @param time
     */
    constructor(time = Date.now()) {
        this.begin = time;
    }
    /**
     * Reset the timer
     */
    reset() {
        this.begin = Date.now();
    }
    /**
     * Return the amount of time in ms since the timer was last reset
     */
    getTime() {
        return Date.now() - this.begin;
    }
    /**
     * Return true if the time since the last reset is greather that the given amount in ms
     *
     * @param {number} amount in ms
     */
    greaterThan(amount) {
        return this.getTime() > amount;
    }
    /**
     * Return true if the time since the last reset is less that the given amount in ms
     *
     * @param {number} amount
     */
    lessThan(amount) {
        return this.getTime() < amount;
    }
}

import { Peer } from "peerjs";
const proxyCache = new WeakMap();
export function proxyfy(object, onchange, root, path = []) {
    if (!root)
        root = object;
    let proxy = new Proxy(object, {
        get(target, property) {
            const value = target[property];
            if (typeof value === 'object' && value !== null) {
                if (proxyCache.has(value))
                    return proxyCache.get(value);
                else
                    return proxyfy(value, onchange, root, [...path, property]);
            }
            return value;
        },
        set(target, property, value) {
            let res = Reflect.set(target, property, value);
            onchange(root, [...path, property], value);
            return res;
        }
    });
    proxyCache.set(object, proxy);
    proxyCache.set(proxy, object);
    return proxy;
}
export function unproxyfy(proxy) {
    return proxyCache.get(proxy) ?? null;
}
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
    NetworkEvent[NetworkEvent["HOST_P2P_SYNCED_DATA"] = 10] = "HOST_P2P_SYNCED_DATA";
    NetworkEvent[NetworkEvent["HOST_P2P_SYNCED_DATA_CHANGED"] = 11] = "HOST_P2P_SYNCED_DATA_CHANGED";
    NetworkEvent[NetworkEvent["HOST_P2P_UNSYNCED_DATA"] = 12] = "HOST_P2P_UNSYNCED_DATA";
    NetworkEvent[NetworkEvent["CLIENT_P2P_OPENED"] = 13] = "CLIENT_P2P_OPENED";
    NetworkEvent[NetworkEvent["CLIENT_P2P_CLOSED"] = 14] = "CLIENT_P2P_CLOSED";
    NetworkEvent[NetworkEvent["CLIENT_P2P_RECEIVED_DATA"] = 15] = "CLIENT_P2P_RECEIVED_DATA";
    NetworkEvent[NetworkEvent["CLIENT_P2P_CONFIRMED_CONNECTION"] = 16] = "CLIENT_P2P_CONFIRMED_CONNECTION";
    NetworkEvent[NetworkEvent["CLIENT_P2P_SYNCED_DATA"] = 17] = "CLIENT_P2P_SYNCED_DATA";
    NetworkEvent[NetworkEvent["CLIENT_P2P_SYNCED_DATA_CHANGED"] = 18] = "CLIENT_P2P_SYNCED_DATA_CHANGED";
    NetworkEvent[NetworkEvent["CLIENT_P2P_UNSYNCED_DATA"] = 19] = "CLIENT_P2P_UNSYNCED_DATA";
    NetworkEvent[NetworkEvent["HOSTING_START"] = 20] = "HOSTING_START";
    NetworkEvent[NetworkEvent["HOSTING_END"] = 21] = "HOSTING_END";
})(NetworkEvent || (NetworkEvent = {}));
/**
 * The Network class uses PeerJS to manage P2P connection.
 * On top of peerjs it manages timeouts conditional hosting (whitelist blacklist)
 *    and auto rejection against unwanted connections.
 */
export class Network {
    peer = null;
    id = null;
    isHosting = false;
    maxClient = 15;
    acceptConnections = true;
    useWhitelist = true;
    whitelist = [];
    blacklist = [];
    connections = new Map();
    callbacks = new Map();
    syncedObjects = new Map();
    /**
     * Returns true if there is any connection currenlty active
     */
    hasConnections() { return this.connections.size !== 0; }
    /**
     * Returns true if the network is hosting and the number of connection currently active is at least equal to this.maxClient
     */
    isFull() { return this.connections.size >= this.maxClient; }
    /**
     * Connect to the signaling server
     */
    start(id, options = {}) {
        let peer = new Peer(id, options);
        peer.on('open', async () => {
            this.peer = peer;
            this.id = peer.id;
            for (let callback of this.getCallbacks(NetworkEvent.PEER_OPENED))
                await callback.call(this, this.id);
        });
        peer.on('connection', async (conn) => {
            let networkConnection = new NetworkConnection(conn, true, this);
            this.connections.set(networkConnection.id, networkConnection);
            for (let callback of this.getCallbacks(NetworkEvent.PEER_CONNECTION))
                await callback.call(this, networkConnection);
        });
        peer.on('close', async () => {
            for (let callback of this.getCallbacks(NetworkEvent.PEER_CLOSED))
                await callback.call(this);
        });
        peer.on('error', async (error) => {
            if (error.type === 'unavailable-id')
                for (let callback of this.getCallbacks(NetworkEvent.UNAVAILABLE_ID))
                    await callback.call(this);
            else if (error.type === 'invalid-id')
                for (let callback of this.getCallbacks(NetworkEvent.INVALID_ID))
                    await callback.call(this);
            else
                for (let callback of this.getCallbacks(NetworkEvent.PEER_ERROR))
                    await callback.call(this, error);
        });
        peer.on('disconnected', async () => {
            for (let callback of this.getCallbacks(NetworkEvent.PEER_DISCONNECT))
                await callback.call(this);
        });
    }
    reconnect() {
        if (this.peer && this.peer.disconnected)
            this.peer.reconnect();
    }
    /**
     * Enable hosting, if any connection is opened at time,
     * uses abortIfConnections to determined if those connections should be closed and the operation should proceed
     * Returns the new state of isHosting
     */
    enableHosting(abortIfConnections = false) {
        if (!this.isHosting)
            if (!this.hasConnections() || !abortIfConnections) {
                this.isHosting = true;
                this.closeAllConnections();
            }
        return this.isHosting;
    }
    /**
     * Disable hosting, if any connection is opened at time,
     * uses abortIfConnections to determined if those connections should be closed and the operation should proceed.
     * Returns the new state of isHosting.
     */
    disableHosting(abortIfConnections = false) {
        if (this.isHosting)
            if (!this.hasConnections() || !abortIfConnections) {
                this.closeAllConnections();
                this.isHosting = false;
            }
        return this.isHosting;
    }
    /**
     * Tries to connect to a given peer.
     * will throw an error if not connected to the signaling server or currently hosting.
     * Will automaticaly store the connectino into this.connections.
     * Will throw an error if you are already connected to a peer.
     */
    connectTo(id) {
        if (id === this.id)
            throw `You can't connect to yourself`;
        if (!this.peer)
            throw `You can't connect to somebody without starting the Network and being connected to the signaling server`;
        if (this.isHosting)
            throw `You can't connect to somebody while hosting`;
        if (this.hasConnections())
            throw `You can only connect to one peer at a time`;
        let networkConnection = new NetworkConnection(this.peer.connect(id, { serialization: 'json' }), false, this);
        this.connections.set(networkConnection.id, networkConnection);
        this.syncedObjects.clear();
        return networkConnection;
    }
    /**
     * Send any data to a given connected peer if it exists
     *
     * @param {string} id
     * @param {any} data
     */
    sendTo(id, data) {
        this.connections.get(id)?.connection.send(data);
    }
    /**
     * Send any data to every connected peer
     *
     * @param {any} data
     */
    sendToAll(data) {
        for (let connection of this.connections)
            connection[1].connection.send(data);
    }
    /**
     * Send any data to every connected peer except a given one
     *
     * @param {string} id
     * @param {any} data
     */
    sendToAllExcept(id, data) {
        for (let connection of this.connections)
            if (connection[0] !== id)
                connection[1].connection.send(data);
    }
    /**
     * Close the connection to a given peer if it exists
     *
     * @param {string} id
     */
    closeConnection(id) {
        this.connections.get(id)?.cleanclose();
    }
    /**
     * Close the connection with all connected peer
     */
    closeAllConnections() {
        for (let connection of this.connections)
            connection[1].cleanclose();
    }
    on(event, callback) {
        if (!this.callbacks.has(event))
            this.callbacks.set(event, []);
        this.callbacks.get(event)?.push(callback);
    }
    /**
     * Returns all callbacks associated with the given event
     */
    getCallbacks(event) {
        return this.callbacks.get(event) ?? [];
    }
    /**
     * Puts a given id into the whitelist
     */
    allow(id) {
        this.whitelist.push(id);
    }
    /**
     * Removes a given id from the whitelist, closing the connection if it exists
     */
    deny(id) {
        let index = this.whitelist.indexOf(id);
        if (index !== -1)
            this.whitelist.splice(index, 1);
        if (this.useWhitelist && this.isHosting)
            this.connections.get(id)?.cleanclose();
    }
    /**
     * Puts a given id into the blacklist, closing the connection if it exists
     */
    ban(id) {
        this.blacklist.push(id);
        this.connections.get(id)?.cleanclose();
    }
    /**
     * Removes a given id from the blacklist
     */
    unban(id) {
        let index = this.blacklist.indexOf(id);
        if (index !== -1)
            this.blacklist.splice(index, 1);
    }
    async syncObject(object) {
        if (!this.isHosting && this.hasConnections())
            throw 'Cannot sync object when not hosting and connected';
        let uuid;
        do {
            uuid = crypto.randomUUID();
        } while (this.syncedObjects.has(uuid));
        let objstr = JSON.stringify(object);
        let proxy = proxyfy(JSON.parse(objstr), (root, path, value) => {
            this.sendToAll({ evt: 'Network$CHANGESYNC', uuid, path, value });
        });
        this.syncedObjects.set(uuid, proxy);
        this.sendToAll({ evt: 'Network$NEWSYNC', uuid, object: objstr });
        for (let callback of this.getCallbacks(NetworkEvent.HOST_P2P_SYNCED_DATA))
            await callback.call(this, uuid, proxy);
    }
    async unsync(uuid) {
        if (!this.isHosting && this.hasConnections())
            throw 'Cannot unsync object when not hosting and connected';
        if (!this.syncedObjects.has(uuid))
            return;
        let unproxyfiedObject = unproxyfy(this.syncedObjects.get(uuid));
        this.syncedObjects.delete(uuid);
        this.sendToAll({ evt: 'Network$UNSYNC', uuid });
        for (let callback of this.getCallbacks(NetworkEvent.HOST_P2P_UNSYNCED_DATA))
            await callback.call(this, unproxyfiedObject);
    }
    async unsyncAll() {
        for (let uuid of [...this.syncedObjects.keys()])
            await this.unsync(uuid);
    }
}
export class NetworkConnection {
    connection;
    timer = new Timer();
    intervalID;
    receiver;
    network;
    constructor(connection, receiver, network) {
        this.connection = connection;
        this.receiver = receiver;
        this.network = network;
        this.connection;
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
    async #open() {
        // console.log(`connection opened with ${this.id}`)
        if (this.receiver) {
            if (!this.network.isHosting || !this.network.acceptConnections ||
                this.network.isFull() ||
                this.network.blacklist.includes(this.id) ||
                this.network.useWhitelist && !this.network.whitelist.includes(this.id)) {
                this.cleanclose();
            }
            else {
                for (let callback of this.network.getCallbacks(NetworkEvent.HOST_P2P_OPENED))
                    await callback.call(this);
                this.connection.send('Network$CONFIRM');
                for (let [uuid, proxy] of this.network.syncedObjects.entries()) {
                    let objstr = JSON.stringify(unproxyfy(proxy));
                    this.network.sendTo(this.id, { evt: 'Network$NEWSYNC', uuid, object: objstr });
                }
            }
        }
        else {
            for (let callback of this.network.getCallbacks(NetworkEvent.CLIENT_P2P_OPENED))
                await callback.call(this);
        }
    }
    async #close() {
        // console.log(`connection closed with ${this.id}`)
        if (this.receiver) {
            for (let callback of this.network.getCallbacks(NetworkEvent.HOST_P2P_CLOSED))
                await callback.call(this);
        }
        else {
            for (let callback of this.network.getCallbacks(NetworkEvent.CLIENT_P2P_CLOSED))
                await callback.call(this);
        }
        this.clean();
    }
    async #data(data) {
        this.timer.reset();
        if (data === 'Network$CLOSE')
            this.cleanclose();
        else if (data === 'Network$IAMHERE')
            return;
        else if (data === 'Network$CONFIRM' && !this.receiver)
            for (let callback of this.network.getCallbacks(NetworkEvent.CLIENT_P2P_CONFIRMED_CONNECTION))
                await callback.call(this);
        else if (typeof data === 'object' && data.evt === 'Network$NEWSYNC') {
            if (this.network.syncedObjects.has(data.uuid))
                return;
            let proxy = proxyfy(JSON.parse(data.object), async (root, path, value) => {
                this.network.sendToAll({ evt: 'Network$CHANGESYNC', uuid: data.uuid, path, value });
            });
            this.network.syncedObjects.set(data.uuid, proxy);
            for (let callback of this.network.getCallbacks(NetworkEvent.CLIENT_P2P_SYNCED_DATA))
                await callback.call(this, data.uuid, proxy);
        }
        else if (typeof data === 'object' && data.evt === 'Network$CHANGESYNC') {
            let object = unproxyfy(this.network.syncedObjects.get(data.uuid));
            let path = [...data.path];
            while (path.length > 1)
                object = object[path.shift()];
            object[path.pop()] = data.value;
            if (this.receiver) {
                this.network.sendToAllExcept(this.id, data);
                for (let callback of this.network.getCallbacks(NetworkEvent.HOST_P2P_SYNCED_DATA_CHANGED))
                    await callback.call(this, data.uuid, data.path, data.value);
            }
            else
                for (let callback of this.network.getCallbacks(NetworkEvent.CLIENT_P2P_SYNCED_DATA_CHANGED))
                    await callback.call(this, data.uuid, data.path, data.value);
        }
        else if (typeof data === 'object' && data.evt === 'Network$UNSYNC') {
            if (!this.network.syncedObjects.has(data.uuid))
                return;
            let unproxyfiedObject = unproxyfy(this.network.syncedObjects.get(data.uuid));
            this.network.syncedObjects.delete(data.uuid);
            for (let callback of this.network.getCallbacks(NetworkEvent.CLIENT_P2P_UNSYNCED_DATA))
                await callback.call(this, unproxyfiedObject);
        }
        else {
            if (this.receiver)
                for (let callback of this.network.getCallbacks(NetworkEvent.HOST_P2P_RECEIVED_DATA))
                    await callback.call(this, data);
            else
                for (let callback of this.network.getCallbacks(NetworkEvent.CLIENT_P2P_RECEIVED_DATA))
                    await callback.call(this, data);
        }
    }
    get id() { return this.connection.peer; }
    /**
     * Removes the connection from Network.connections and deletes the timeout interval
     */
    clean() {
        clearInterval(this.intervalID);
        this.network.connections.delete(this.id);
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

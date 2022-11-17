import { Network } from "./Network.js";
import NetworkEvents from "./NetworkEvents.js";
import { Timer } from "./Timer.js";
export default class NetworkConnection {
    connection;
    timer = new Timer();
    intervalID;
    receiver;
    constructor(connection, receiver) {
        this.connection = connection;
        this.receiver = receiver;
        this.intervalID = setInterval(this.#timeout.bind(this), 1000);
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
                for (let callback of Network.getCallbacks(NetworkEvents.HOST_P2P_OPENED))
                    callback.call(this);
                this.connection.send('Network$CONFIRM');
            }
        }
        else {
            for (let callback of Network.getCallbacks(NetworkEvents.CLIENT_P2P_OPENED))
                callback.call(this);
        }
    }
    #close() {
        // console.log(`connection closed with ${this.id}`)
        if (this.receiver) {
            for (let callback of Network.getCallbacks(NetworkEvents.HOST_P2P_CLOSED))
                callback.call(this);
        }
        else {
            for (let callback of Network.getCallbacks(NetworkEvents.CLIENT_P2P_CLOSED))
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
            for (let callback of Network.getCallbacks(NetworkEvents.CLIENT_P2P_CONFIRMED_CONNECTION))
                callback.call(this, data);
        else if (this.receiver)
            for (let callback of Network.getCallbacks(NetworkEvents.HOST_P2P_RECEIVED_DATA))
                callback.call(this, data);
        else
            for (let callback of Network.getCallbacks(NetworkEvents.CLIENT_P2P_RECEIVED_DATA))
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

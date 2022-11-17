class NetworkEvents {

    static PEER_OPENED = 0 // id has been obtained
    static UNAVAILABLE_ID = 1 // id could not be obtained
    static INVALID_ID = 2 // id is invalid
    static PEER_CONNECTION = 3// A user is connecting to you
    static PEER_CLOSED = 4 // When peer is destroyed
    static PEER_DISCONNECT = 5// Disconnected from signaling server
    static PEER_ERROR = 6 // Fatal errors moslty

    static HOST_P2P_OPENED = 7 // A connexion has been opened on the host/server side
    static HOST_P2P_CLOSED = 8 // A connexion has been closed on the host/server side
    static HOST_P2P_RECEIVED_DATA = 9

    static CLIENT_P2P_OPENED = 10
    static CLIENT_P2P_CLOSED = 11
    static CLIENT_P2P_RECEIVED_DATA = 12
    static CLIENT_P2P_CONFIRMED_CONNECTION = 13

    static HOSTING_START = 14
    static HOSTING_END = 15

}

export default NetworkEvents
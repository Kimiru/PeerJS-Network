# PeerJS-Network

PeerJS-Network is a wrapper that aim to make it easy to use PeerJS for a client/server style of communication. 

Handeling whitelist, blacklist, timeout, max clients...

Most, if not all event have been matched and callback can be added for all of them.

Host's events and client's event are disjoint and can be handled separatly.

For technical reasons, Peer class must be stored inside window.Peer field.
This allow for the user to fetch the file wherever they want and not have to modify the path inside the Network.js file.
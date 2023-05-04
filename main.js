import { Network, NetworkEvent, proxyfy, unproxyfy } from './js/Network.js'

let ul = document.querySelector('ul')

function log(...data) {
    for (let entry of data) {
        let li = document.createElement('li')
        if (typeof entry === 'object') {
            let seen = []
            li.textContent = JSON.stringify(entry, function (key, val) {
                if (val != null && typeof val == "object") {
                    if (seen.indexOf(val) >= 0) {
                        return
                    }
                    seen.push(val)
                }
                return val
            }, 2)
        }
        else
            li.textContent = entry.toString()
        ul.appendChild(li)
    }
}


function newSync(name) {

    return async (uuid, proxy) => {
        log('new sync ' + name + ': ' + uuid)
    }

}

function dataChange(uuid, path, value) {

    log(this.network.syncedObjects.get(uuid))
    // log(`${uuid} ${path.join('.')}`, this.syncedObjects.get(uuid))

}

function unsync(obj) {

    log('unsync')
    log(obj)

}


let host = new Network()
host.on(NetworkEvent.HOST_P2P_SYNCED_DATA, newSync('host'))
host.on(NetworkEvent.HOST_P2P_SYNCED_DATA_CHANGED, dataChange)
host.on(NetworkEvent.HOST_P2P_UNSYNCED_DATA, unsync)

host.enableHosting()
host.useWhitelist = false

let client0 = new Network()
let client1 = new Network()
client0.on(NetworkEvent.CLIENT_P2P_SYNCED_DATA, newSync('client0'))
client0.on(NetworkEvent.CLIENT_P2P_SYNCED_DATA_CHANGED, dataChange)
client0.on(NetworkEvent.CLIENT_P2P_UNSYNCED_DATA, unsync)
client1.on(NetworkEvent.CLIENT_P2P_SYNCED_DATA, newSync('client1'))
client1.on(NetworkEvent.CLIENT_P2P_SYNCED_DATA_CHANGED, dataChange)
client1.on(NetworkEvent.CLIENT_P2P_UNSYNCED_DATA, unsync)

host.on(NetworkEvent.PEER_OPENED, () => {

    client0.on(NetworkEvent.PEER_OPENED, () => {
        client1.on(NetworkEvent.PEER_OPENED, () => {
            log('all open')
            host.on(NetworkEvent.HOST_P2P_OPENED, function () {

                if (this.id === client0.id) {

                    log('connected to host')

                    host.syncObject({ toto: { lolo: 2 } })

                    setTimeout(() => {
                        log('client1 connecting')
                        client1.connectTo(host.id)
                    }, 1000)
                }

                if (this.id === client1.id) {

                    setTimeout(() => {
                        let proxy = client1.syncedObjects.entries().next().value[1]
                        proxy.toto.lolo = 3

                        log(proxy)
                        setTimeout(() => {
                            let uuid = client1.syncedObjects.entries().next().value[0]
                            host.unsync(uuid)
                        }, 1000)
                    }, 1000)

                }

            })
            client0.connectTo(host.id)

        })
        client1.start()
        log('client1 start')
    })
    client0.start()
    log('client0 start')

})
host.start()
log('host start')


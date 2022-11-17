import { Network } from "../js/Network.js";
import NetworkEvents from "../js/NetworkEvents.js";

Network.on(NetworkEvents.UNAVAILABLE_ID, function (err) {

    console.log('unavailable')

})

Network.start('abcdef')
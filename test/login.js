const OK = require('../dist')
const apikeys = require('../keys.conf')

let okex = new OK.OKEx(apikeys.apiKey, apikeys.secret)

okex.listenAllMessages(msg => {
    console.log(msg.data)
})
var a = okex.login()
var b = okex.login().then(res => {
    console.log('第二次')
    console.log(res)
})

a.then(res => {
    console.log(res)
})
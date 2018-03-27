let OK = require('../dist/OKEx')
const conf = require('../keys.conf')
const err_code = require('../dist/err_code')

let okex = new OK.OKEx(conf.apiKey, conf.secret)

okex.listenAllMessages(res=>{
    console.log('===============')
    console.log(res.data)
    console.log('===============')
})

okex.login().then()
okex.setParams({
    symbol: 'btc_usd',
    lever_rate: '20',
    contract_type: 'this_week'
})

okex.openBuy({
    price: '8570',
    amount: '1'
}).then(res => {
    console.log('============= openBuy ==============')
    console.log(res)
    console.log('====================================')
})
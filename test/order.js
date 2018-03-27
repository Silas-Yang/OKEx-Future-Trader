let OK = require('../dist')
const conf = require('../keys.conf')
const err_code = require('../dist/err_code')

let okex = new OK.OKEx(conf.apiKey, conf.secret)

okex.listenAllMessages(res=>{
    console.log('===============')
    console.log(res.data)
    console.log('===============')
})

okex.login().then()

okex.order({
    symbol: OK.CoinType.btc,
    contract_type: OK.ContractType.this_week,
    price: '8680',
    amount: '1',
    match_price: '0',
    lever_rate: '20',
    type: '1'
}).then(res => {
    console.log(res)
    if(res[0].data.result == false) {
        console.log(err_code[res[0].data.error_code])
    }
})
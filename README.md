# OKEX合约交易行情WebSocket接口
使用基于`Rx.js`封装WebSocket的observable-socket连接OKEX，使用Promise封装交易与行情接口。

## 使用方法
配置`keys.conf.js`中的API Key后，例如：

```javascript
const OK = require('./dist')
const apikeys = require('./keys.conf')

let okex = new OK.OKEx(apikeys.apiKey, apikeys.secret)

/* 登录 */
okex.login().then(console.log) // 服务器返回结果 [{"binary":0,"channel":"login","data":{"result":true}}]

/* 设置参数 */
okex.setParams({
    symbol: 'btc_usd',
    lever_rate: '20',
    contract_type: 'this_week'
})

/* 开多 */
okex.openBuy({
    price: '8570',
    amount: '1'
}).then(res => {
    console.log('============= openBuy ==============')
    console.log(res)
    console.log('====================================')
})

/** 收到服务器返回之后输出结果
============= openBuy ==============
[ { binary: 0,
    channel: 'ok_futureusd_trade',
    data: { result: true, order_id: 458956156910592 } } ]
====================================
*/
```

## **Done**
* 实现了不同频道的消息队列
* 实现了开多、开空、平多、平空、取消订单，以及全部行情接口
* 可自定义添加订阅


## **TODO：**
1. 订单管理
2. 持仓查询
3. 爆仓订单查询
4. 账户信息查询
5. 文档
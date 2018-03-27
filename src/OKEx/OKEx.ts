import * as Rx from 'rxjs'
import * as WebSocket from 'ws'
import {ObservableSocket, ObservableSocketRet} from '../ObservableSocket'
import * as URL from 'url'
import * as crypto from 'crypto'

const OKEX_FUTUREUSD = 'wss://real.okex.com:10440/websocket/okexapi'

/* 订阅种类 */
export const enum SubscriptionType {
    ticker,
    kline,
    depth,
    depth_z,
    trade, // 交易所的交易信息
    index,
    trades, // 我的交易信息
    userinfo,
    positions
}

/* 交割期种类 */
export const enum ContractType {
    this_week = 'this_week',
    next_week = 'next_week',
    quarter = 'quarter'
}

/* 币种 */
export const enum CoinType {
    btc = 'btc',
    ltc = 'ltc',
    eth = 'eth',
    etc = 'etc',
    bch = 'bch'
}

/* 订阅选项 */
export interface SubscriptionOption {
    /* 订阅类型 */
    subType: SubscriptionType,
    /* 订阅选项 */
    option: {
        coin: CoinType,
        contype: ContractType,
        depth?: 5|10|20,
        period?: '1min'|'3min'|'5min'|'15min'|'30min'|'1hour'|'2hour'|'4hour'|'6hour'|'12hour'|'day'|'3day'|'week',
    },
    /* 自定义订阅ID */
    id?: string,
    /* 订阅消息处理 */
    handler?: (data: ServerResponse | string)=>any,
    /* 取消订阅 */
    subscription?: Rx.Subscription
}

/* 服务器返回结构 */
export interface ServerResponse {
    channel?: any
    success?: any
    errorcode?: any
    data?: any
}

/* 客户端请求结构 */
export interface ClientRequest {
    /* event: addChannel(注册请求数据)/removeChannel(注销请求数据) */
    event: string

    /* OKEX 提供请求数据类型  */
    channel?: string

    /* parameters 参数为选填参数 */
    parameters?: {[key:string]: string}

    /* binary 参数为选填参数，压缩数据: 1 压缩数据 ,0 原始数据 默认 0  */
    binary?: 0 | 1
}

export class OKEx {
    protected ws: WebSocket
    protected ows: ObservableSocketRet
    protected subscriptionQueue: Array<SubscriptionOption> = []

    private apiKey: string
    private secret: string
    private logined: boolean

    private trades: Map<string, any>
    private userinfo: Map<string, any>
    private positions: Map<string, any>

    /* 交易参数：交易对，合约交割期，杠杆倍数 */
    public symbol: CoinType
    public contract_type: ContractType
    public lever_rate: '10' | '20'

    private pong: {
        heartbeatWaiting: 0|1|2|3, // 0: 收到pong包; 1: 第一次等待pong包; 2: 第二次等待pong包; 3: 前两次pong包都未收到
        pong_subscription?: Rx.Subscription
        pong_interval?: any
    } = {
        heartbeatWaiting: 0,
        pong_interval: null
    }

    private reconnecting: boolean

    /* 频道 */
    private channels: Map<string, {promise?: Promise<any>, reject?: Function, resolve?: Function}> = new Map()

    public constructor(apiKey?: string, secret?: string) {
        this.apiKey = apiKey
        this.secret = secret
        this.init()
    }

    private init() {
        this.ws = new WebSocket(OKEX_FUTUREUSD)
        this.ows = ObservableSocket(this.ws)
        this.startHeartBeat()
        /* 若登录过，则重新登录 */
        if(this.logined) {
            this.login()
        }
    }

    private reconnect() {
        if(this.reconnecting === true) return
        this.reconnecting = true
        
        /* 停止心跳包 */
        this.stopHeartBeat()

        /* 开始重连 */
        setTimeout(()=>this.init(), 30 * 1000);
        
    }

    public startHeartBeat() {
        if(this.pong.pong_interval !== null) return

        /* 发送心跳包 */
        this.pong.pong_interval = setInterval(()=>{
            if(this.pong.heartbeatWaiting === 3) {
                /* TODO: 断线重连 */
                console.log('断线重连')
                /* 尝试重连一次 */
                setTimeout(()=>this.init(), 10 * 1000)
            }

            /* 发送ping，并且等待pong包增1 */
            console.log('发送ping')
            this.ows.up(JSON.stringify({event: 'ping'})).then(()=> ++this.pong.heartbeatWaiting)
        },  30 * 1000)

        /* 订阅pong包 */
        this.pong.pong_subscription = this.ows.down.filter(T => {
            let e = JSON.parse(T.data).event
            return e === 'pong'
        }).subscribe(
            next => {
                this.pong.heartbeatWaiting = 0
            }
        )
    }

    /* 停止心跳包 */
    public stopHeartBeat() {
        clearInterval(this.pong.pong_interval)
        this.pong.pong_interval = null
        this.pong.pong_subscription.unsubscribe()
    }

    /* 设置交易对等参数 */
    public setParams(param: {
        symbol: CoinType
        contract_type: ContractType
        lever_rate: '10' | '20'
    }) {
        let {symbol, contract_type, lever_rate} = param
        this.symbol = symbol
        this.contract_type = contract_type
        this.lever_rate = lever_rate
    }

    /* 订阅 */
    public sub(param: SubscriptionOption): Rx.Subscription {
        let data = {
            event: 'addChannel',
            channel: ''
        }
        let need_request = true
        switch(param.subType) {
            /* 合约行情 */
            case SubscriptionType.ticker:
                data.channel = `ok_sub_futureusd_${param.option.coin.toString()}_ticker_${param.option.contype.toString()}`
            break

            /* 合约K线数据 */
            case SubscriptionType.kline:
                if(typeof param.option.period === undefined) {
                    throw new Error('UNDEFINED_PERIOD')
                }
                data.channel = `ok_sub_futureusd_${param.option.coin.toString()}_kline_${param.option.contype.toString()}_${param.option.period.toString()}`
            break

            /* 合约指数 */
            case SubscriptionType.index:
                data.channel = `ok_sub_futureusd_${param.option.coin.toString()}_index`
            break

            /* 合约交易信息 */
            case SubscriptionType.trade:
                data.channel = `ok_sub_futureusd_${param.option.coin.toString()}_trade_${param.option.contype.toString()}`
            break

            /* 合约市场深度增量返回 */
            case SubscriptionType.depth:
                data.channel = `ok_sub_futureusd_${param.option.coin.toString()}_depth_${param.option.contype.toString()}`
            break

            /* 合约市场深度全量返回 */
            case SubscriptionType.depth_z:
                if(typeof param.option.depth === undefined) {
                    throw new Error('UNKOWN_DEPTH')
                }
                data.channel = `ok_sub_futureusd_${param.option.coin.toString()}_depth_${param.option.contype.toString()}_${param.option.depth.toString()}`
            break

            /* 成交信息 */
            case SubscriptionType.trades:
            /* 用户信息 */
            case SubscriptionType.userinfo:
            /* 持仓信息 */
            case SubscriptionType.positions:
                need_request = false
            break

            default:
                throw new Error('UNSUPPORTED_SUBSCRIPTION')
        }

        if(need_request) {
            this.ows.up(JSON.stringify(data))
        }

        /* 订阅 */
        let subscription = this.ows.down.map( T => {
            let arr = <Array<any>>JSON.parse(T.data)
            if(Array.isArray(arr)) {
                return arr.filter((item, index) => {
                    return item['channel'] === data.channel
                })
            }
            return []
        } ).filter(x =>{
            return x.length != 0
        }).subscribe(
            next => {
                if(typeof param.handler === 'function') {
                    next.forEach((item, index) => {
                        param.handler((item))
                    })
                }
            },
            error => {
                console.log(error)
            },
            () => {
                console.log('重连')
                this.reconnect()
            }
        )

        /* 传入订阅  */
        param.subscription = subscription

        /* 添加至历史订阅队列，断线重连时以便自动重新订阅 */
        this.subscriptionQueue.push(param)

        return subscription
    }

    /* 监听所有消息 */
    public listenAllMessages(eventHandler: (e: MessageEvent)=>any, err?: ()=>any, completed?: ()=>any): Rx.Subscription {
        return this.ows.down.subscribe(
            eventHandler,
            err,
            completed
        )
    }
    
    /* 取消订阅 */
    public unSub(subID: string): boolean {
        return this.subscriptionQueue.some((subscr, index) => {
            if( subscr.id === subID && typeof subscr.subscription.unsubscribe !== undefined) {
                subscr.subscription.unsubscribe()
                this.subscriptionQueue.splice(index, 1)
                return true
            }
            return false
        })
    }

    /* 登录 */
    public login() {
        let data: ClientRequest = {
            event: 'login',
            parameters: {}
        }
        return this.sendToChannel('login', data).then(res => {
            if(res[0].data && res[0].data.result == 'true') {
                this.logined = true
            }
            return res
        })
    }

    /* 下单 */
    public order(param:{
        symbol: CoinType,
        contract_type: ContractType,
        price: string,
        amount: string,
        type: '1'|'2'|'3'|'4', // 1:开多 2:开空 3:平多 4:平空
        match_price: '0'|'1' // 是否为对手价： 0:不是 1:是 当取值为1时,price无效
        lever_rate: '10'|'20' // 杠杆倍数 value:10\20 默认10
    }) {
        let data: ClientRequest = {
            event: 'addChannel',
            channel: 'ok_futureusd_trade',
            parameters: param
        }
        return this.sendToChannel('ok_futureusd_trade', data)
    }

    /* 开多 */
    public openBuy({
        symbol=this.symbol,
        contract_type=this.contract_type,
        price,
        amount,
        lever_rate=this.lever_rate,
    }:{
        symbol: CoinType
        contract_type: ContractType
        price: string
        amount: string
        lever_rate: '10' | '20'
    }) {
        return this.order({
            symbol,
            contract_type,
            price,
            amount,
            lever_rate,
            type: '1',
            match_price: '0'
        })

    }

    /* 开空 */
    public openSell({
        symbol=this.symbol,
        contract_type=this.contract_type,
        price,
        amount,
        lever_rate=this.lever_rate,
    }:{
        symbol: CoinType
        contract_type: ContractType
        price: string
        amount: string
        lever_rate: '10' | '20'
    }) {
        return this.order({
            symbol,
            contract_type,
            price,
            amount,
            lever_rate,
            type: '2',
            match_price: '0'
        })

    }

    /* 平多 */
    public closeBuy({
        symbol=this.symbol,
        contract_type=this.contract_type,
        price,
        amount,
        lever_rate=this.lever_rate,
    }:{
        symbol: CoinType
        contract_type: ContractType
        price: string
        amount: string
        lever_rate: '10' | '20'
    }) {
        return this.order({
            symbol,
            contract_type,
            price,
            amount,
            lever_rate,
            type: '3',
            match_price: '0'
        })

    }

    /* 平空 */
    public closeSell({
        symbol=this.symbol,
        contract_type=this.contract_type,
        price,
        amount,
        lever_rate=this.lever_rate,
    }:{
        symbol: CoinType
        contract_type: ContractType
        price: string
        amount: string
        lever_rate: '10' | '20'
    }) {
        return this.order({
            symbol,
            contract_type,
            price,
            amount,
            lever_rate,
            type: '4',
            match_price: '0'
        })
    }

    /* 取消合约 */
    public cancel({
        symbol=this.symbol,
        order_id, // 订单ID
        contract_type=this.contract_type // 合约类型: this_week:当周 next_week:下周 quarter:季度
    }: {
        symbol: CoinType
        order_id: string
        contract_type: ContractType
    }) {
        let data = {
            'event': 'addChannel',
            'channel': 'ok_futureusd_cancel_order',
            'parameters': {
                symbol,
                order_id,
                contract_type
            }
        }
        return this.sendToChannel('ok_futureusd_cancel_order', data)
    }
    
    /* 查询账户信息 */
    public getUserInfo() {
        let data: ClientRequest = {
            event: 'addChannel',
            channel:'ok_futureusd_userinfo',
            parameters: {}
        }
        return this.sendToChannel('ok_futureusd_userinfo', data)
    }

    /* 查询订单信息 */
    public getOrderInfo(param: {
        'symbol': CoinType,
        'order_id': string,
        'contract_type': ContractType,
        'status': string, // 查询状态 1:未完成的订单 2:已经完成的订单
        'current_page': string | '1', // 当前页数
        'page_length': string | '1', // 每页获取条数，最多不超过50
    }) {
        let data = {
            'event': 'addChannel',
            'channel': 'ok_futureusd_orderinfo',
            'parameters': param
        }
        return this.sendToChannel('ok_futureusd_orderinfo', data)
    }

    /* 发送请求 */
    public sendRaw(data: string | object): Promise<any> {
        let _data = typeof data === 'object' ? JSON.stringify(data) : data
        return this.ows.up(_data)
    }

    /**
     * 签名并且发送
     * @param data 要发送的数据
     */
    public send(data: ClientRequest, sign: boolean=true): Promise<any> {
        if(sign) {
            if(!data.parameters) data.parameters = {}
            data.parameters.api_key = this.apiKey
            data.parameters.sign = this.sign(data.parameters)
        }
        return this.sendRaw(data)
    }
    
    /**
     * 签名
     * @param params 参数对象
     * @return sign的值
     */
    private sign(params: {[key:string]: any}): string {
        let keys = Object.keys(params).sort()
        let newParams = new URL.URLSearchParams()
        keys.forEach(key => {
            newParams.append(key, params[key])
        })
        newParams.append('secret_key', this.secret)
        return crypto.createHash('md5').update(newParams.toString()).digest('hex').toUpperCase()
    }

    /* 向频道发送消息，添至频道的Promsie的then队列 */
    private sendToChannel(channel: string, data: ClientRequest): Promise<any> {
        let promise = null

        /* 检查该频道是否订阅过 */
        if(this.channels.has(channel) === false) {
            /* 生成Promise */
            let reject:Function = null
            let resolve:Function = null
            promise = new Promise ((_resolve, _reject) => {
                resolve = _resolve
                reject = _reject
            })

            /* 添加频道至Map */
            this.channels.set(channel,{promise, reject, resolve})
            
            /* 订阅频道并resolve或reject */
            this.ows.down.map(T => {
                return (JSON.parse(T.data) as Array<ServerResponse>).filter(item  => item.channel === channel)
            }).filter(T => T.length > 0).subscribe(
                next => {
                    let c = this.channels.get(channel)
                    c.resolve(next)
                },
                error => {
                    let c = this.channels.get(channel)
                    c.reject(error)
                }
            )

            /* 发送消息至频道 */
            this.send(data)
            
            /* 返回Promise，用户使用then */
            return promise

        } else {
            /* 获取频道的Promise */
            let _channel = this.channels.get(channel)

            /* 接上promise链, 用户使用then */
            return _channel.promise.then(res => {
                /* 生成新的Promise加入至then队列，收到上一个Promise的resolve后才会将新Promise的resolve和reject替换旧的 */
                let _promise = new Promise((resolve, reject) => {
                    _channel.reject = reject
                    _channel.resolve = resolve
                })
                _channel.promise = _promise
                /* 发送消息至频道 */
                this.send(data)

                /* 返回Promise链 */
                return _promise
            })
        }
    }
}
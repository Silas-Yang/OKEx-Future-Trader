"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocket = require("ws");
const ObservableSocket_1 = require("../ObservableSocket");
const URL = require("url");
const crypto = require("crypto");
const OKEX_FUTUREUSD = 'wss://real.okex.com:10440/websocket/okexapi';
var SubscriptionType;
(function (SubscriptionType) {
    SubscriptionType[SubscriptionType["ticker"] = 0] = "ticker";
    SubscriptionType[SubscriptionType["kline"] = 1] = "kline";
    SubscriptionType[SubscriptionType["depth"] = 2] = "depth";
    SubscriptionType[SubscriptionType["depth_z"] = 3] = "depth_z";
    SubscriptionType[SubscriptionType["trade"] = 4] = "trade";
    SubscriptionType[SubscriptionType["index"] = 5] = "index";
    SubscriptionType[SubscriptionType["trades"] = 6] = "trades";
    SubscriptionType[SubscriptionType["userinfo"] = 7] = "userinfo";
    SubscriptionType[SubscriptionType["positions"] = 8] = "positions";
})(SubscriptionType = exports.SubscriptionType || (exports.SubscriptionType = {}));
var ContractType;
(function (ContractType) {
    ContractType["this_week"] = "this_week";
    ContractType["next_week"] = "next_week";
    ContractType["quarter"] = "quarter";
})(ContractType = exports.ContractType || (exports.ContractType = {}));
var CoinType;
(function (CoinType) {
    CoinType["btc"] = "btc";
    CoinType["ltc"] = "ltc";
    CoinType["eth"] = "eth";
    CoinType["etc"] = "etc";
    CoinType["bch"] = "bch";
})(CoinType = exports.CoinType || (exports.CoinType = {}));
class OKEx {
    constructor(apiKey, secret) {
        this.subscriptionQueue = [];
        this.pong = {
            heartbeatWaiting: 0,
            pong_interval: null
        };
        this.channels = new Map();
        this.apiKey = apiKey;
        this.secret = secret;
        this.init();
    }
    init() {
        this.ws = new WebSocket(OKEX_FUTUREUSD);
        this.ows = ObservableSocket_1.ObservableSocket(this.ws);
        this.startHeartBeat();
        if (this.logined) {
            this.login();
        }
    }
    reconnect() {
        if (this.reconnecting === true)
            return;
        this.reconnecting = true;
        this.stopHeartBeat();
        setTimeout(() => this.init(), 30 * 1000);
    }
    startHeartBeat() {
        if (this.pong.pong_interval !== null)
            return;
        this.pong.pong_interval = setInterval(() => {
            if (this.pong.heartbeatWaiting === 3) {
                console.log('断线重连');
                setTimeout(() => this.init(), 10 * 1000);
            }
            console.log('发送ping');
            this.ows.up(JSON.stringify({ event: 'ping' })).then(() => ++this.pong.heartbeatWaiting);
        }, 30 * 1000);
        this.pong.pong_subscription = this.ows.down.filter(T => {
            let e = JSON.parse(T.data).event;
            return e === 'pong';
        }).subscribe(next => {
            this.pong.heartbeatWaiting = 0;
        });
    }
    stopHeartBeat() {
        clearInterval(this.pong.pong_interval);
        this.pong.pong_interval = null;
        this.pong.pong_subscription.unsubscribe();
    }
    setParams(param) {
        let { symbol, contract_type, lever_rate } = param;
        this.symbol = symbol;
        this.contract_type = contract_type;
        this.lever_rate = lever_rate;
    }
    sub(param) {
        let data = {
            event: 'addChannel',
            channel: ''
        };
        let need_request = true;
        switch (param.subType) {
            case 0:
                data.channel = `ok_sub_futureusd_${param.option.coin.toString()}_ticker_${param.option.contype.toString()}`;
                break;
            case 1:
                if (typeof param.option.period === undefined) {
                    throw new Error('UNDEFINED_PERIOD');
                }
                data.channel = `ok_sub_futureusd_${param.option.coin.toString()}_kline_${param.option.contype.toString()}_${param.option.period.toString()}`;
                break;
            case 5:
                data.channel = `ok_sub_futureusd_${param.option.coin.toString()}_index`;
                break;
            case 4:
                data.channel = `ok_sub_futureusd_${param.option.coin.toString()}_trade_${param.option.contype.toString()}`;
                break;
            case 2:
                data.channel = `ok_sub_futureusd_${param.option.coin.toString()}_depth_${param.option.contype.toString()}`;
                break;
            case 3:
                if (typeof param.option.depth === undefined) {
                    throw new Error('UNKOWN_DEPTH');
                }
                data.channel = `ok_sub_futureusd_${param.option.coin.toString()}_depth_${param.option.contype.toString()}_${param.option.depth.toString()}`;
                break;
            case 6:
            case 7:
            case 8:
                need_request = false;
                break;
            default:
                throw new Error('UNSUPPORTED_SUBSCRIPTION');
        }
        if (need_request) {
            this.ows.up(JSON.stringify(data));
        }
        let subscription = this.ows.down.map(T => {
            let arr = JSON.parse(T.data);
            if (Array.isArray(arr)) {
                return arr.filter((item, index) => {
                    return item['channel'] === data.channel;
                });
            }
            return [];
        }).filter(x => {
            return x.length != 0;
        }).subscribe(next => {
            if (typeof param.handler === 'function') {
                next.forEach((item, index) => {
                    param.handler((item));
                });
            }
        }, error => {
            console.log(error);
        }, () => {
            console.log('重连');
            this.reconnect();
        });
        param.subscription = subscription;
        this.subscriptionQueue.push(param);
        return subscription;
    }
    listenAllMessages(eventHandler, err, completed) {
        return this.ows.down.subscribe(eventHandler, err, completed);
    }
    unSub(subID) {
        return this.subscriptionQueue.some((subscr, index) => {
            if (subscr.id === subID && typeof subscr.subscription.unsubscribe !== undefined) {
                subscr.subscription.unsubscribe();
                this.subscriptionQueue.splice(index, 1);
                return true;
            }
            return false;
        });
    }
    login() {
        let data = {
            event: 'login',
            parameters: {}
        };
        return this.sendToChannel('login', data).then(res => {
            if (res[0].data && res[0].data.result == 'true') {
                this.logined = true;
            }
            return res;
        });
    }
    order(param) {
        let data = {
            event: 'addChannel',
            channel: 'ok_futureusd_trade',
            parameters: param
        };
        return this.sendToChannel('ok_futureusd_trade', data);
    }
    openBuy({ symbol = this.symbol, contract_type = this.contract_type, price, amount, lever_rate = this.lever_rate, }) {
        return this.order({
            symbol,
            contract_type,
            price,
            amount,
            lever_rate,
            type: '1',
            match_price: '0'
        });
    }
    openSell({ symbol = this.symbol, contract_type = this.contract_type, price, amount, lever_rate = this.lever_rate, }) {
        return this.order({
            symbol,
            contract_type,
            price,
            amount,
            lever_rate,
            type: '2',
            match_price: '0'
        });
    }
    closeBuy({ symbol = this.symbol, contract_type = this.contract_type, price, amount, lever_rate = this.lever_rate, }) {
        return this.order({
            symbol,
            contract_type,
            price,
            amount,
            lever_rate,
            type: '3',
            match_price: '0'
        });
    }
    closeSell({ symbol = this.symbol, contract_type = this.contract_type, price, amount, lever_rate = this.lever_rate, }) {
        return this.order({
            symbol,
            contract_type,
            price,
            amount,
            lever_rate,
            type: '4',
            match_price: '0'
        });
    }
    cancel({ symbol = this.symbol, order_id, contract_type = this.contract_type }) {
        let data = {
            'event': 'addChannel',
            'channel': 'ok_futureusd_cancel_order',
            'parameters': {
                symbol,
                order_id,
                contract_type
            }
        };
        return this.sendToChannel('ok_futureusd_cancel_order', data);
    }
    getUserInfo() {
        let data = {
            event: 'addChannel',
            channel: 'ok_futureusd_userinfo',
            parameters: {}
        };
        return this.sendToChannel('ok_futureusd_userinfo', data);
    }
    getOrderInfo(param) {
        let data = {
            'event': 'addChannel',
            'channel': 'ok_futureusd_orderinfo',
            'parameters': param
        };
        return this.sendToChannel('ok_futureusd_orderinfo', data);
    }
    sendRaw(data) {
        let _data = typeof data === 'object' ? JSON.stringify(data) : data;
        return this.ows.up(_data);
    }
    send(data, sign = true) {
        if (sign) {
            if (!data.parameters)
                data.parameters = {};
            data.parameters.api_key = this.apiKey;
            data.parameters.sign = this.sign(data.parameters);
        }
        return this.sendRaw(data);
    }
    sign(params) {
        let keys = Object.keys(params).sort();
        let newParams = new URL.URLSearchParams();
        keys.forEach(key => {
            newParams.append(key, params[key]);
        });
        newParams.append('secret_key', this.secret);
        return crypto.createHash('md5').update(newParams.toString()).digest('hex').toUpperCase();
    }
    sendToChannel(channel, data) {
        let promise = null;
        if (this.channels.has(channel) === false) {
            let reject = null;
            let resolve = null;
            promise = new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
            });
            this.channels.set(channel, { promise, reject, resolve });
            this.ows.down.map(T => {
                return JSON.parse(T.data).filter(item => item.channel === channel);
            }).filter(T => T.length > 0).subscribe(next => {
                let c = this.channels.get(channel);
                c.resolve(next);
            }, error => {
                let c = this.channels.get(channel);
                c.reject(error);
            });
            this.send(data);
            return promise;
        }
        else {
            let _channel = this.channels.get(channel);
            return _channel.promise.then(res => {
                let _promise = new Promise((resolve, reject) => {
                    _channel.reject = reject;
                    _channel.resolve = resolve;
                });
                _channel.promise = _promise;
                this.send(data);
                return _promise;
            });
        }
    }
}
exports.OKEx = OKEx;
//# sourceMappingURL=OKEx.js.map
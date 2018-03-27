"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const OK = require("./OKEx");
function DiffType() {
    return {
        this_week_$_next_week: new Difference(),
        next_week_$_this_week: new Difference(),
        this_week_$_quarter: new Difference(),
        quarter_$_this_week: new Difference(),
        next_week_$_quarter: new Difference(),
        quarter_$_next_week: new Difference(),
    };
}
class Difference {
    constructor() {
        this.factors = {
            n: 0,
            average: 0,
            denominator_sum: 0
        };
        this.current_diff = 0;
    }
    calculate(contract_sell, contract_buy) {
        this.current_diff = contract_sell - contract_buy;
        if (this.current_diff === 0) {
            return;
        }
        let { n, average, denominator_sum } = this.factors;
        denominator_sum += 1 / this.current_diff;
        if (denominator_sum === 0) {
            return;
        }
        n++;
        average = n / denominator_sum;
        if (this.factors.average !== 0 && Math.abs((average / this.factors.average) - 1) > 0.3)
            return;
        this.factors = {
            n,
            average,
            denominator_sum
        };
    }
    getCurrentDiff() {
        return this.current_diff;
    }
    getAverageDiff() {
        return this.factors.average;
    }
}
class Start {
    constructor(Level) {
        this.differences = DiffType();
        this.current_data = {};
        let okex = new OK.OKEx();
        this.okex = okex;
        okex.sub({
            subType: 3,
            option: {
                coin: "btc",
                contype: "this_week",
                depth: 5,
            },
            handler: this.createDepthHandler("this_week", Level)
        });
        okex.sub({
            subType: 3,
            option: {
                coin: "btc",
                contype: "next_week",
                depth: 5,
            },
            handler: this.createDepthHandler("next_week", Level)
        });
        okex.sub({
            subType: 3,
            option: {
                coin: "btc",
                contype: "quarter",
                depth: 5,
            },
            handler: this.createDepthHandler("quarter", Level)
        });
    }
    createDepthHandler(conType, level) {
        return (res) => {
            if (res.data) {
                if (level > 5 || level < 1) {
                    throw new Error('invalid value of level');
                }
                this.current_data[conType] = {
                    ask: {
                        price: res.data.asks[5 - level][0],
                        contract_amount: res.data.asks[5 - level][1],
                        coin_amount: res.data.asks[5 - level][2],
                        accumulate_coin: res.data.asks[5 - level][3],
                        accumulate_contract: res.data.asks[5 - level][4]
                    },
                    bid: {
                        price: res.data.bids[level - 1][0],
                        contract_amount: res.data.bids[level - 1][1],
                        coin_amount: res.data.bids[level - 1][2],
                        accumulate_coin: res.data.bids[level - 1][3],
                        accumulate_contract: res.data.bids[level - 1][4]
                    }
                };
                this.analyze(conType);
                output();
            }
            else {
                if (res.errorcode) {
                    console.log(`错误码：${res.errorcode}`);
                }
            }
        };
    }
    analyze(curr_contract) {
        let counterpart_1;
        let counterpart_2;
        switch (curr_contract) {
            case "this_week":
                counterpart_1 = "next_week";
                counterpart_2 = "quarter";
                break;
            case "next_week":
                counterpart_1 = "this_week";
                counterpart_2 = "quarter";
                break;
            case "quarter":
                counterpart_1 = "next_week";
                counterpart_2 = "this_week";
                break;
        }
        this.calcDiff(curr_contract, counterpart_1);
        this.calcDiff(curr_contract, counterpart_2);
    }
    calcDiff(curr_contract, counterpart) {
        if (this.current_data[counterpart]) {
            let contract_sell = this.current_data[counterpart].bid.price;
            let contract_buy = this.current_data[curr_contract].ask.price;
            this.differences[`${counterpart}_$_${curr_contract}`].open_buy_price = contract_buy;
            this.differences[`${counterpart}_$_${curr_contract}`].open_sell_price = contract_sell;
            this.differences[`${counterpart}_$_${curr_contract}`].calculate(contract_sell, contract_buy);
            contract_sell = this.current_data[curr_contract].bid.price;
            contract_buy = this.current_data[counterpart].ask.price;
            this.differences[`${curr_contract}_$_${counterpart}`].open_buy_price = contract_buy;
            this.differences[`${curr_contract}_$_${counterpart}`].open_sell_price = contract_sell;
            this.differences[`${curr_contract}_$_${counterpart}`].calculate(contract_sell, contract_buy);
        }
    }
}
function output() {
    let diff = start.differences;
    console.log('=====================');
    for (var item in diff) {
        console.log(`${item}: average: ${diff[item].getAverageDiff()}, current: ${diff[item].getCurrentDiff()}, sell: ${diff[item].open_sell_price}, buy: ${diff[item].open_buy_price}`);
    }
}
let start = new Start(1);
//# sourceMappingURL=start.js.map
const Strategy = require('./dist/Strategies/highFreq')
const OK = require('./dist/OKEx')
const keys = require('./keys.conf')

let okex = new OK.OKEx(keys.apiKey, keys.secret)
let highFreq = new Strategy.HighFreq(okex)
highFreq.start()
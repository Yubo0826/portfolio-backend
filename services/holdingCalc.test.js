// node services/holdingCalc.test.js
import assert from 'node:assert/strict';
import { computeHolding } from './holdingCalc.js';

const buy = (shares, price, fee = 0) => ({ symbol: 'X', transaction_type: 'buy', shares, price, fee, currency: 'TWD' });
const sell = (shares, price = 0) => ({ symbol: 'X', transaction_type: 'sell', shares, price });

// 買 10@100 + 10@200（手續費 20）→ 均價 (1000 + 2020) / 20 = 151；賣出不改均價
let h = computeHolding([buy(10, 100), buy(10, 200, 20), sell(5)]);
assert.deepEqual([h.shares, h.avgCost, h.currency], [15, 151, 'TWD']);

// 舊交易改股數（10 → 20）後重算，不受之前的值影響
h =computeHolding([buy(20, 100), buy(10, 200), sell(5)]);
assert.deepEqual([h.shares, h.avgCost], [25, 133.333]);

// 清倉後重新買入，成本重新起算
h = computeHolding([buy(10, 100), sell(10), buy(5, 300)]);
assert.deepEqual([h.shares, h.avgCost], [5, 300]);

// 小數股數不累積浮點誤差
h = computeHolding([buy(0.1, 10), buy(0.2, 10), sell(0.3)]);
assert.equal(h.shares, 0);

// 刪掉買入、只剩賣出 → 擋下
assert.throws(() => computeHolding([sell(1)]), { status: 400 });
assert.throws(() => computeHolding([buy(5, 10), sell(6)]), { status: 400 });

console.log('holdingCalc ok');

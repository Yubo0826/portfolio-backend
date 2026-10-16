// node services/holdingCalc.test.js
import assert from 'node:assert/strict';
import { computeHolding, validateTransaction } from './holdingCalc.js';

const buy = (shares, price, fee = 0, fx_rate) => ({ symbol: 'X', transaction_type: 'buy', shares, price, fee, currency: 'TWD', fx_rate });
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

// 美金成本用各筆買入「當時的匯率」換算：10@100 TWD @31 + 10@200 TWD @32
// = 1000/31 + 2000/32 = 32.2581 + 62.5 = 94.7581
h = computeHolding([buy(10, 100, 0, 31), buy(10, 200, 0, 32)]);
assert.equal(h.totalCostUsd, 94.7581);
assert.equal(h.avgCost, 150); // 原幣均價不受匯率影響

// 賣出依比例扣掉美金成本（與原幣成本同一套比例）
h = computeHolding([buy(10, 100, 0, 31), buy(10, 200, 0, 32), sell(10)]);
assert.equal(h.totalCostUsd, 47.379);

// 任何一筆買入缺匯率就回 null，不混用兩種基準
h = computeHolding([buy(10, 100, 0, 31), buy(10, 200)]);
assert.equal(h.totalCostUsd, null);

// 清倉後重新買入，之前缺匯率的買入不再影響現在的成本
h = computeHolding([buy(10, 100), sell(10), buy(5, 300, 0, 30)]);
assert.equal(h.totalCostUsd, 50);

// 美金交易的匯率是 1
h = computeHolding([{ symbol: 'X', transaction_type: 'buy', shares: 2, price: 150, fee: 1, currency: 'USD', fx_rate: 1 }]);
assert.equal(h.totalCostUsd, 301);

// 全數賣光時沒有持股，不回成本
h = computeHolding([buy(10, 100, 0, 31), sell(10)]);
assert.equal(h.totalCostUsd, null);

// 交易欄位驗證：合法的過，負數、零、錯的類型、壞日期、超過欄位上限都擋
const ok = { symbol: 'AAPL', transaction_type: 'buy', shares: 10, price: 150.5, fee: 1, transaction_date: '2026-01-02' };
assert.equal(validateTransaction(ok), null);
assert.equal(validateTransaction({ ...ok, shares: '0.5', price: '12', fee: undefined, transaction_date: undefined }), null);
for (const bad of [
  { shares: -1 }, { shares: 0 }, { shares: 'abc' }, { shares: 1e9 },
  { price: -5 }, { price: 0 }, { price: null },
  { fee: -1 }, { fee: 'x' },
  { transaction_type: 'BUY' }, { transaction_type: 'dividend' },
  { symbol: '' }, { symbol: 'TOOLONGSYMBOL' }, { symbol: 123 },
  { transaction_date: '2026-13-45' },
]) assert.ok(validateTransaction({ ...ok, ...bad }), JSON.stringify(bad));

console.log('holdingCalc ok');

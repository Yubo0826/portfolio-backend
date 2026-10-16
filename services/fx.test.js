// node services/fx.test.js
import assert from 'node:assert/strict';
import { convert, fxSymbolOf, rateOnOrBefore, ratesForDates, ratesOnDate } from './fx.js';

assert.equal(convert(100, 'USD', 'TWD', 30), 3000);
assert.equal(convert(3000, 'TWD', 'USD', 30), 100);
assert.equal(convert(100, 'TWD', 'TWD', 30), 100);
assert.equal(convert(100, 'USD', 'TWD', undefined), 100); // 抓不到匯率時不換（不要變成 NaN）

// 多幣別：1 USD = 150 JPY = 7.8 HKD = 31.5 TWD
const rateTable = { JPY: 150, HKD: 7.8, TWD: 31.5 };
assert.equal(convert(15000, 'JPY', 'USD', rateTable), 100);
assert.equal(convert(100, 'USD', 'JPY', rateTable), 15000);
// 跨幣別經由 USD 中轉：15,000 JPY = 100 USD = 3,150 TWD
assert.equal(convert(15000, 'JPY', 'TWD', rateTable), 3150);
assert.equal(convert(780, 'HKD', 'TWD', rateTable), 3150);
// 匯率表沒有的幣別原樣回傳，不要默默當成等值美金
assert.equal(convert(1000, 'BRL', 'USD', rateTable), 1000);
assert.equal(convert(1000, 'USD', 'BRL', rateTable), 1000);

assert.equal(fxSymbolOf('JPY'), 'JPY=X');
assert.equal(fxSymbolOf('USD'), null); // 基準幣本身不需要報價

// ratesOnDate 把「每幣別一張日期表」攤成某一天的 { code: rate }
const fxByCurrency = new Map([
  ['JPY', new Map([['2026-01-05', 150], ['2026-01-06', 151]])],
  ['TWD', new Map([['2026-01-05', 31.5]])],
]);
assert.deepEqual(ratesOnDate(fxByCurrency, '2026-01-05'), { JPY: 150, TWD: 31.5 });
// 當天缺報價的幣別不會帶進來（convert 會因此原樣回傳，而不是乘上 undefined）
assert.deepEqual(ratesOnDate(fxByCurrency, '2026-01-06'), { JPY: 151 });

// 週末沒報價沿用前一天、第一筆報價之前用第一筆補
const rates = new Map([['2026-01-05', 31], ['2026-01-07', 32]]);
assert.deepEqual(
  [...ratesForDates(['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07'], rates).values()],
  [31, 31, 31, 32]
);
assert.equal(ratesForDates(['2026-01-02'], new Map()).get('2026-01-02'), undefined);

// rateOnOrBefore：當天沒報價往前找；比資料起點還早的日期退回最早一筆
const history = new Map([['2024-01-12', 31.0], ['2024-01-15', 31.1], ['2024-01-16', 31.2]]);
assert.equal(rateOnOrBefore(history, '2024-01-15'), 31.1);
assert.equal(rateOnOrBefore(history, '2024-01-14'), 31.0); // 1/13、1/14 是週末
assert.equal(rateOnOrBefore(history, '2024-01-20'), 31.2); // 之後沒資料就用最後一筆
assert.equal(rateOnOrBefore(history, '2023-12-01'), 31.0); // 早於資料起點用最早一筆
assert.equal(rateOnOrBefore(new Map(), '2024-01-15'), null);

console.log('fx ok');

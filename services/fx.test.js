// node services/fx.test.js
import assert from 'node:assert/strict';
import { convert, ratesForDates } from './fx.js';

assert.equal(convert(100, 'USD', 'TWD', 30), 3000);
assert.equal(convert(3000, 'TWD', 'USD', 30), 100);
assert.equal(convert(100, 'TWD', 'TWD', 30), 100);
assert.equal(convert(100, 'USD', 'TWD', undefined), 100); // 抓不到匯率時不換（不要變成 NaN）

// 週末沒報價沿用前一天、第一筆報價之前用第一筆補
const rates = new Map([['2026-01-05', 31], ['2026-01-07', 32]]);
assert.deepEqual(
  [...ratesForDates(['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07'], rates).values()],
  [31, 31, 31, 32]
);
assert.equal(ratesForDates(['2026-01-02'], new Map()).get('2026-01-02'), undefined);

console.log('fx ok');

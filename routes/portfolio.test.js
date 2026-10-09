// node routes/portfolio.test.js
import assert from 'node:assert/strict';
import { copyRows } from './portfolio.js';

assert.deepEqual(
  copyRows([{ id: 1, portfolio_id: 7, cash_account_id: 3, uid: 'u', symbol: 'VT', shares: 2 }], 9),
  [{ uid: 'u', symbol: 'VT', shares: 2, portfolio_id: 9 }],
);
assert.deepEqual(copyRows([], 9), []);

console.log('portfolio ok');

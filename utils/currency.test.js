// node utils/currency.test.js
import assert from 'node:assert/strict';
import { fromQuoteCurrency, normalizeCurrency, normalizeQuoteCurrency } from './currency.js';

assert.equal(normalizeCurrency(null), 'USD');
assert.equal(normalizeCurrency(' jpy '), 'JPY');

// 主幣代碼原樣通過
assert.deepEqual(fromQuoteCurrency(3094, 'JPY'), { amount: 3094, currency: 'JPY' });
// GBp 是便士，金額要一起換回英鎊；大小寫有意義，GBP 不能被除以 100
assert.deepEqual(fromQuoteCurrency(605.7, 'GBp'), { amount: 6.057, currency: 'GBP' });
assert.deepEqual(fromQuoteCurrency(605.7, 'GBP'), { amount: 605.7, currency: 'GBP' });
assert.equal(normalizeQuoteCurrency('ZAc'), 'ZAR');
// 匯率代號（TWD=X）的報價幣別就是主幣，不會被動到
assert.deepEqual(fromQuoteCurrency(32.4, 'TWD'), { amount: 32.4, currency: 'TWD' });

console.log('currency ok');

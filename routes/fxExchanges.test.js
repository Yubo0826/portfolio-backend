// node routes/fxExchanges.test.js
import assert from 'node:assert/strict';
import { parseExchange } from './fxExchanges.js';

const ok = { side: 'buy', currency: 'usd', foreign_amount: '1000', twd_amount: 32000, fee: '', date: '2026-11-03' };

const parsed = parseExchange(ok);
assert.equal(parsed.currency, 'USD');
assert.equal(parsed.foreign_amount, 1000);
assert.equal(parsed.fee, 0);
assert.equal(parsed.note, null);

assert.equal(parseExchange({ ...ok, side: 'swap' }), null);
assert.equal(parseExchange({ ...ok, currency: 'TWD' }), null);
assert.equal(parseExchange({ ...ok, currency: 'XYZ' }), null);
assert.equal(parseExchange({ ...ok, twd_amount: 0 }), null);
assert.equal(parseExchange({ ...ok, fee: -1 }), null);
assert.equal(parseExchange({ ...ok, date: 'nope' }), null);
assert.equal(parseExchange({ ...ok, date: '2999-01-01' }), null);

console.log('fxExchanges ok');

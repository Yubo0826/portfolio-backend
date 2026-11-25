// node routes/users.test.js
import assert from 'node:assert/strict';
import { emailConfirmed } from './users.js';

assert.equal(emailConfirmed(' Me@Example.com ', 'me@example.com'), true);
assert.equal(emailConfirmed('other@example.com', 'me@example.com'), false);
assert.equal(emailConfirmed('', 'me@example.com'), false);
assert.equal(emailConfirmed(undefined, undefined), false); // demo 帳號沒有 email
assert.equal(emailConfirmed('', ''), false);

console.log('users ok');

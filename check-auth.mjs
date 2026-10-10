// 身分驗證的冒煙檢查：先 `npm start`，再 `node check-auth.mjs [baseURL]`
import assert from 'node:assert';

const base = process.argv[2] || 'http://localhost:3000';

// 假 token 一律 401
let res = await fetch(`${base}/api/portfolio?uid=victim`, { headers: { Authorization: 'Bearer forged' } });
assert.equal(res.status, 401, 'forged token should be rejected');

// 沒帶 token：body 裡偽造的 uid 會被換成 demo-user（看 server log 的 refresh-prices 那行）
res = await fetch(`${base}/api/holdings/refresh-prices`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ uid: 'victim', portfolio_id: 1 }),
});
assert.notEqual(res.status, 401, 'no token should fall back to demo-user');

// 不能指定收件人寄信
res = await fetch(`${base}/api/user/send-test-email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ to: 'someone@example.com' }),
});
assert.equal(res.status, 400, 'anonymous test email must not be sent to client-chosen address');

// 不能用 client 指定的 email 建立使用者（沒 token 就沒有已驗證的 email）
res = await fetch(`${base}/api/user`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ uid: 'victim', email: 'someone@example.com' }),
});
assert.equal(res.status, 400, 'user email must come from the verified token, not the body');

console.log('auth checks passed');

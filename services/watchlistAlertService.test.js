import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectAlerts } from './watchlistAlertService.js';

const row = (id, uid, symbol, target_price, alert_above) => ({
  id, uid, symbol, name: symbol, target_price, alert_above, users: { email: `${uid}@x.com` },
});

test('collectAlerts 挑出到價項目並依使用者合併', () => {
  const rows = [
    row(1, 'a', 'AAPL', '200', true),   // 漲到 200，現價 210 → 到價
    row(2, 'a', 'TSLA', '150', false),  // 跌到 150，現價 140 → 到價
    row(3, 'a', 'NVDA', '500', true),   // 漲到 500，現價 400 → 未到
    row(4, 'b', 'AAPL', '210', true),   // 剛好等於目標價 → 到價
    row(5, 'b', 'MSFT', '300', false),  // 抓不到價 → 略過
  ];
  const prices = { AAPL: 210, TSLA: 140, NVDA: 400, MSFT: null };

  const result = collectAlerts(rows, prices);

  assert.deepEqual(result.map(r => r.email), ['a@x.com', 'b@x.com']);
  assert.deepEqual(result[0].items.map(i => i.id), [1, 2]);
  assert.deepEqual(result[1].items.map(i => i.id), [4]);
});

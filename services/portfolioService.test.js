import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAllocations } from './portfolioService.js';

const h = (symbol, current_price, total_shares, currency) => ({ symbol, current_price, total_shares, currency });

test('台美股混合時先換成 USD 再算佔比', () => {
  // 0050 市值 3000 TWD = 100 USD，VOO 市值 100 USD → 各半
  const a = computeAllocations([h('0050.TW', 150, 20, 'TWD'), h('VOO', 100, 1, 'USD')], 30);
  assert.equal(a['0050.TW'], 0.5);
  assert.equal(a.VOO, 0.5);
});

test('沒價格或沒股數的不算，全空回傳空物件', () => {
  assert.deepEqual(computeAllocations([h('A', null, 10, 'USD'), h('B', 10, 1, 'USD')], 30), { B: 1 });
  assert.deepEqual(computeAllocations([h('A', null, 10, 'USD')], 30), {});
});

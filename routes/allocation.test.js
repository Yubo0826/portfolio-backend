// node routes/allocation.test.js
import assert from 'node:assert/strict';
import { validateAllocation } from './allocation.js';

const a = (symbol, target) => ({ symbol, target });

assert.equal(validateAllocation([]), null); // 清空
assert.equal(validateAllocation([a('VT', 60), a('BND', '40')]), null);
assert.equal(validateAllocation([a('A', 33.33), a('B', 33.33), a('C', 33.34)]), null);
for (const bad of [
  undefined, 'x',
  [a('VT', 60), a('BND', 30)],          // 總和不是 100
  [a('VT', 50), a('VT', 50)],           // 重複
  [a('VT', 110), a('BND', -10)],        // 超出範圍
  [a('VT', 'abc')],
  [a('', 100)], [a('TOOLONGSYMBOL', 100)],
]) assert.ok(validateAllocation(bad), JSON.stringify(bad));

console.log('allocation ok');

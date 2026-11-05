// node routes/yahooFinance.test.js
import assert from 'node:assert/strict';
import { lastSessionCloses, sectorWeightsOf } from './yahooFinance.js';

const q = (iso, close) => ({ date: new Date(iso), close });

// 只留最後一個交易時段：前一天的點與 null close 都被濾掉
assert.deepEqual(lastSessionCloses([
  q('2026-10-19T19:55:00Z', 10),
  q('2026-10-20T13:30:00Z', 11),
  q('2026-10-20T13:35:00Z', null),
  q('2026-10-20T19:55:00Z', 12.34567),
]), [11, 12.3457]);
assert.deepEqual(lastSessionCloses([]), []);
assert.deepEqual(lastSessionCloses(undefined), []);

// 產業權重：ETF 用 sectorWeightings（濾掉 0），個股 sector 轉成 ETF 的 key
assert.deepEqual(sectorWeightsOf({ topHoldings: { sectorWeightings: [{ technology: 0.6 }, { energy: 0 }, { realestate: 0.1 }] } }),
  [{ sector: 'technology', weight: 0.6 }, { sector: 'realestate', weight: 0.1 }]);
assert.deepEqual(sectorWeightsOf({ summaryProfile: { sector: 'Financial Services' } }), [{ sector: 'financial_services', weight: 1 }]);
assert.deepEqual(sectorWeightsOf({ summaryProfile: { sector: 'Real Estate' } }), [{ sector: 'realestate', weight: 1 }]);
assert.deepEqual(sectorWeightsOf({ topHoldings: { sectorWeightings: [] } }), []);
assert.deepEqual(sectorWeightsOf(), []);

console.log('yahooFinance ok');
process.exit(0); // 匯入 router 會建立 prisma 連線，跑完直接結束

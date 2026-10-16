// 回填既有交易的成交當日匯率，並重算持股的美金成本。
//
//   node scripts/backfill-fx-rate.mjs --dry-run   # 只印出會寫入什麼，不改資料庫
//   node scripts/backfill-fx-rate.mjs             # 實際寫入
//
// 可重複執行：只處理 fx_rate 還是 null 的交易。抓不到匯率的留 null，
// 呼叫端會退回用當下匯率換算（與回填前的行為相同），下次再跑即可。

import prisma from '../utils/prisma.js';
import { buildFxRateLookup } from '../services/fxHistory.js';
import { recalcHolding } from '../services/holdingCalc.js';

const dryRun = process.argv.includes('--dry-run');

const main = async () => {
  const pending = await prisma.transactions.findMany({
    where: { fx_rate: null },
    orderBy: { transaction_date: 'asc' },
  });

  if (pending.length === 0) {
    console.log('沒有需要回填的交易');
    return;
  }

  console.log(`待回填交易：${pending.length} 筆${dryRun ? '（dry-run，不會寫入）' : ''}`);

  const lookup = await buildFxRateLookup(
    pending.map((tx) => ({ currency: tx.currency, date: tx.transaction_date }))
  );

  let filled = 0;
  const missing = new Set();

  for (const tx of pending) {
    const rate = lookup(tx.currency, tx.transaction_date);
    if (rate == null) {
      missing.add(tx.currency);
      continue;
    }

    console.log(`  #${tx.id} ${tx.symbol} ${String(tx.transaction_date).slice(0, 10)} ${tx.currency} -> ${rate}`);
    if (!dryRun) {
      await prisma.transactions.update({ where: { id: tx.id }, data: { fx_rate: rate } });
    }
    filled++;
  }

  console.log(`已回填 ${filled} 筆${missing.size ? `，抓不到匯率的幣別：${[...missing].join(', ')}` : ''}`);

  // 持股的 total_cost_usd 要從交易重算才會更新
  const affected = await prisma.holdings.findMany({ select: { uid: true, portfolio_id: true, symbol: true } });
  console.log(`重算持股成本：${affected.length} 筆`);
  if (!dryRun) {
    for (const h of affected) {
      await recalcHolding(prisma, h.uid, h.portfolio_id, h.symbol);
    }
  }
};

main()
  .catch((e) => {
    console.error('回填失敗:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

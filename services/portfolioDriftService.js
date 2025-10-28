import { PrismaClient } from '../generated/prisma/index.js';
const prisma = new PrismaClient();

/**
 * 計算單一投資組合的實際配置比例
 */
async function getActualAllocations(portfolioId) {
  const holdings = await prisma.holdings.findMany({
    where: { portfolio_id: portfolioId },
  });

  // 計算總市值
  const totalValue = holdings.reduce((sum, h) => {
    if (!h.current_price || !h.total_shares) return sum;
    return sum + Number(h.current_price) * Number(h.total_shares);
  }, 0);

  // 算出每個標的的實際佔比
  const actuals = {};
  holdings.forEach((h) => {
    if (!h.current_price || !h.total_shares || totalValue === 0) return;
    const value = Number(h.current_price) * Number(h.total_shares);
    actuals[h.symbol] = value / totalValue;
  });

  return actuals;
}

/**
 * 檢查某個 portfolio 是否有偏差
 */
export async function checkPortfolioDrift(portfolioId, uid, driftThreshold = 0.05) {
  const allocations = await prisma.allocation.findMany({
    where: { portfolio_id: portfolioId, uid },
  });

  const actuals = await getActualAllocations(portfolioId);
  const drifts = [];

  for (const alloc of allocations) {
    const target = Number(alloc.target) / 100; // DB 是百分比數值，例如 25 → 0.25
    const actual = actuals[alloc.symbol] || 0;
    const deviation = Math.abs(actual - target);

    if (deviation > driftThreshold) {
      drifts.push({
        symbol: alloc.symbol,
        target: (target * 100).toFixed(2) + '%',
        actual: (actual * 100).toFixed(2) + '%',
        deviation: (deviation * 100).toFixed(2) + '%',
      });
    }
  }

  return drifts;
}

/**
 * 主程式：檢查所有使用者
 */
export async function checkAllPortfolios() {
  console.log('🚀 開始每日投資組合偏差檢查...');
  const portfolios = await prisma.portfolios.findMany();

  for (const p of portfolios) {
    const drifts = await checkPortfolioDrift(p.id, p.uid);
    if (drifts.length > 0) {
      console.log(`⚠️ Portfolio: ${p.name} (uid: ${p.uid}) 有偏差:`, drifts);
      // TODO: 實作通知 (例如發送 Email、Line、或寫入 alert table)
    }
  }

  console.log('✅ 所有投資組合檢查完成');
}

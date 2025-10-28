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
      // 組 Email 內容
      const html = `
          <h2>投資組合偏差警示 - ${p.name}</h2>
          <p>您的投資組合持股比例與設定值偏差超出 <b>${(p.users.drift_threshold * 100).toFixed(1)}%</b></p>
          <table border="1" cellspacing="0" cellpadding="5">
            <tr><th>標的</th><th>實際配置</th><th>目標配置</th><th>偏差</th></tr>
            ${drifts.map(d => `
              <tr>
                <td>${d.symbol}</td>
                <td>${d.actual}</td>
                <td>${d.target}</td>
                <td>${d.deviation}</td>
              </tr>`).join('')}
          </table>
          <p style="margin-top:10px;">請考慮進行再平衡或調整持倉。</p>
        `

        // 寄信
        await sendEmail(p.users.email, `【Stockbar】投資組合 ${p.name} 偏差超出閾值通知`, html);
    }
  }

  console.log('所有投資組合檢查完成');
}

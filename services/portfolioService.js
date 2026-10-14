import prisma from '../utils/prisma.js';

import { sendEmail } from '../utils/emailService.js';
import { getLatestPrice } from '../routes/holdings.js';
import { USD_TWD_SYMBOL, convert } from './fx.js';

/**
 * 計算實際配置比例：市值先換成 USD 再算佔比，台美股混合的投組才不會失真
 */
export function computeAllocations(holdings, usdTwd) {
  const values = holdings
    .filter((h) => h.current_price && h.total_shares)
    .map((h) => [h.symbol, convert(Number(h.current_price) * Number(h.total_shares), h.currency, 'USD', usdTwd)]);
  const total = values.reduce((sum, [, v]) => sum + v, 0);
  return total ? Object.fromEntries(values.map(([s, v]) => [s, v / total])) : {};
}

/**
 * 檢查某個 portfolio 是否有偏差
 */
export async function checkPortfolioDrift(portfolioId, uid, driftThreshold, usdTwd) {
  const allocations = await prisma.allocation.findMany({
    where: { portfolio_id: portfolioId, uid },
  });

  const holdings = await prisma.holdings.findMany({ where: { portfolio_id: portfolioId } });
  const actuals = computeAllocations(holdings, usdTwd);
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
  console.log('開始每日投資組合偏差檢查...')

  // ponytail: 抓不到匯率就整批跳過（含純單一幣別的投組），避免台美股混合投組誤報；明天排程再檢查
  const usdTwd = await getLatestPrice(USD_TWD_SYMBOL)
  if (!usdTwd) return console.error('❌ 取不到 USD/TWD 匯率，略過今日偏差檢查')

  const portfolios = await prisma.portfolios.findMany({
    include: { users: true },
  })

  for (const p of portfolios) {
    const driftThreshold = Number(p.drift_threshold) || 0.05
    const drifts = await checkPortfolioDrift(p.id, p.uid, driftThreshold, usdTwd)

    console.log(`⚠️ ${p.users.display_name}  投資組合 ${p.name} 偏差 ${drifts.length} 項 , email alert: ${p.enable_email_alert}`);

    // 偏差回到容忍值內就重新啟用通知
    if (drifts.length === 0) {
      if (p.drift_alerted_at) await prisma.portfolios.update({ where: { id: p.id }, data: { drift_alerted_at: null } })
      continue
    }
    // 同一段偏差期間只寄一次
    if (!p.enable_email_alert || p.drift_alerted_at) continue

    console.log(`⚠️ Portfolio [${p.name}] 偏差超出 ${driftThreshold * 100}%`, drifts)
    const html = buildDriftEmailTemplate(p, drifts, driftThreshold)
    const sent = await sendEmail(p.users.email, `《通知》投資組合 ${p.name} 偏差超出設定值`, html)
    // 寄失敗就不標記，明天再試
    if (sent) await prisma.portfolios.update({ where: { id: p.id }, data: { drift_alerted_at: new Date() } })
  }

  console.log('所有投資組合檢查完成')
}



const buildDriftEmailTemplate = (portfolio, drifts, driftThreshold) => {
  return `
    <h2>投資組合 ${portfolio.name} 偏差警示</h2>
    <p>您的投資組合持股比例與設定值偏差超出 <b>${(driftThreshold * 100).toFixed(1)}%</b></p>
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
  `;
}
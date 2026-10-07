import prisma from '../utils/prisma.js';
import { sendEmail } from '../utils/emailService.js';
import { getLatestPrice } from '../routes/holdings.js';

/**
 * 挑出到價的關注項目，依使用者分組
 * rows: watchlist 列（含 users），prices: { [symbol]: number | null }
 * 回傳 [{ email, items: [{ id, symbol, name, target, price, above }] }]
 */
export function collectAlerts(rows, prices) {
  const byUser = new Map();
  for (const row of rows) {
    const price = prices[row.symbol];
    const target = Number(row.target_price);
    if (price == null || !row.users?.email) continue;
    if (row.alert_above ? price < target : price > target) continue;

    if (!byUser.has(row.uid)) byUser.set(row.uid, { email: row.users.email, items: [] });
    byUser.get(row.uid).items.push({
      id: row.id, symbol: row.symbol, name: row.name, target, price, above: row.alert_above,
    });
  }
  return [...byUser.values()];
}

// ponytail: 跟著每日排程 15:30 檢查一次，只看當下報價，抓不到盤中觸價；要盤中通知得改成更密的排程
export async function checkWatchlistAlerts() {
  const rows = await prisma.watchlist.findMany({
    where: { target_price: { not: null }, alerted_at: null },
    include: { users: true },
  });
  if (!rows.length) return;

  const symbols = [...new Set(rows.map(r => r.symbol))];
  const prices = Object.fromEntries(
    await Promise.all(symbols.map(async s => [s, await getLatestPrice(s)]))
  );

  for (const { email, items } of collectAlerts(rows, prices)) {
    const sent = await sendEmail(email, `《通知》關注清單有 ${items.length} 檔到達目標價`, buildAlertEmailTemplate(items));
    // 寄失敗就不標記，明天再試
    if (!sent) continue;
    await prisma.watchlist.updateMany({
      where: { id: { in: items.map(i => i.id) } },
      data: { alerted_at: new Date() },
    });
  }
  console.log('關注清單目標價檢查完成');
}

const buildAlertEmailTemplate = (items) => `
  <h2>關注清單到價通知</h2>
  <table border="1" cellspacing="0" cellpadding="5">
    <tr><th>標的</th><th>名稱</th><th>目前價格</th><th>目標價</th></tr>
    ${items.map(i => `
      <tr>
        <td>${i.symbol}</td>
        <td>${i.name ?? ''}</td>
        <td>${i.price}</td>
        <td>${i.above ? '≥' : '≤'} ${i.target}</td>
      </tr>`).join('')}
  </table>
  <p style="margin-top:10px;">每個目標價只通知一次，修改目標價後會重新啟用通知。</p>
`;

import cron from 'node-cron';
import { PrismaClient } from '../generated/prisma/index.js';
import { checkPortfolioDrift } from '../services/portfolioService.js';
import { syncDividendsForUserHoldings } from '../routes/dividends.js';
import yahooFinance from 'yahoo-finance2';

const prisma = new PrismaClient();


/*
  每日排程任務：
  每天 0:00：

  抓出所有 user + portfolio

  更新所有 holdings 的價格 & 配息紀錄

  再執行 投資組合偏差檢查
*/

const task = cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] 開始每日 holdings 更新與投資組合檢查...');

  try {
    const users = await prisma.users.findMany({
      include: { portfolios: true },
    });

    for (const user of users) {
      for (const portfolio of user.portfolios) {
        // 更新holdings價格
        await refreshUserHoldings(user.uid, portfolio.id);
        // 同步配息紀錄
        await syncDividendsForUserHoldings(user.uid, portfolio.id);
        // 檢查投資組合偏差
        await checkPortfolioDrift(portfolio.id, user.uid, user.drift_threshold);
      }
    }

    console.log('每日任務檢查完成。');
  } catch (error) {
    console.error('❌ 每日任務執行失敗:', error);
  }
});


// 取得單一股票最新價格
const getLatestPrice = async (symbol) => {
  try {
    const data = await yahooFinance.quote(symbol);
    return (
      data.regularMarketPrice ||
      data.regularMarketPreviousClose ||
      data.regularMarketOpen ||
      0
    );
  } catch (error) {
    console.error('❌ 無法取得最新價格:', symbol, error);
    return 0;
  }
};

// 更新特定使用者的所有 holdings
const refreshUserHoldings = async (uid, portfolio_id) => {
  const holdings = await prisma.holdings.findMany({
    where: { uid, portfolio_id },
  });

  if (!holdings.length) return;

  console.log(`更新使用者 ${uid} 的 portfolio ${portfolio_id} holdings 價格...`);

  const updatedHoldings = await Promise.all(
    holdings.map(async (holding) => {
      const latestPrice = await getLatestPrice(holding.symbol);
      return prisma.holdings.update({
        where: { id: holding.id },
        data: { current_price: latestPrice },
      });
    })
  );

  console.log(`使用者 ${uid} 的 holdings 更新完成，共 ${updatedHoldings.length} 筆。`);
};

export default task;
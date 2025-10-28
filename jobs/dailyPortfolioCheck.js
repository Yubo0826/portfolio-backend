import cron from 'node-cron';
import { PrismaClient } from '../generated/prisma/index.js';
import { checkPortfolioDrift } from '../services/portfolioService.js';

const prisma = new PrismaClient();

// 每天早上 8:00 執行
cron.schedule('0 8 * * *', async () => {
  console.log('⏰ [CRON] 開始檢查投資組合偏差...');

  try {
    const users = await prisma.users.findMany({
      include: { portfolio: true },
    });

    for (const user of users) {
      await checkPortfolioDrift(user);
    }

    console.log('✅ 所有用戶投資組合檢查完成。');
  } catch (error) {
    console.error('❌ 投資組合檢查失敗:', error);
  }
});

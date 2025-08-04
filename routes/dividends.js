import express from 'express';
const router = express.Router();
import yahooFinance from 'yahoo-finance2';

import { PrismaClient } from '../generated/prisma/index.js';
const prisma = new PrismaClient();


router.get('/', async (req, res) => {
  try {
    const { uid, portfolio_id } = req.query;
    if (!uid || !portfolio_id) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const dividends = await prisma.dividends.findMany({
      where: {
        uid,
        portfolio_id: Number(portfolio_id),
      },
    });

    res.json(dividends);
  } catch (error) {
    console.error('Error fetching dividends:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/sync', async (req, res) => {
    const { uid, portfolio_id, symbol } = req.body;

    if (!uid || !portfolio_id || !symbol) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
      // 同步單一股票的配息紀錄
      await syncDividendsForUserPortfolio(uid, portfolio_id);
      const dividends = await prisma.dividends.findMany({
      where: {
        uid,
        portfolio_id: Number(portfolio_id),
      },
    });
      res.json({ message: 'Dividends synced successfully', dividends });
    } catch (error) {
      console.error('Error syncing dividends:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);


async function syncDividendsForUserHoldings(uid, portfolioId) {
  // 取得該使用者該投資組合的所有交易紀錄
  const transactions = await prisma.transaction.findMany({
    where: {
      userId: uid,
      portfolioId,
    },
    orderBy: {
      date: 'asc',
    },
  });

  // 按 symbol 分組，找出每支股票的首次購買日
  const symbolGroups = {};
  for (const tx of transactions) {
    if (!symbolGroups[tx.symbol]) {
      symbolGroups[tx.symbol] = tx.date;
    } else {
      const existingDate = symbolGroups[tx.symbol];
      symbolGroups[tx.symbol] = new Date(Math.min(new Date(tx.date), new Date(existingDate)));
    }
  }

  const now = new Date();

  for (const symbol of Object.keys(symbolGroups)) {
    const fromDate = symbolGroups[symbol];
    const period1 = Math.floor(new Date(fromDate).getTime() / 1000);
    const period2 = Math.floor(now.getTime() / 1000);

    try {
      const result = await yahooFinance.chart(symbol, {
        period1,
        period2,
        interval: '1d',
        events: ['dividends'],
      });

      const dividends = result?.events?.dividends ?? [];

      for (const dividend of dividends) {
        const existing = await prisma.dividend.findFirst({
          where: {
            userId: uid,
            portfolioId,
            symbol,
            date: new Date(dividend.date * 1000),
          },
        });

        if (!existing) {
          await prisma.dividend.create({
            data: {
              userId: uid,
              portfolioId,
              symbol,
              amount: dividend.amount,
              date: new Date(dividend.date * 1000),
            },
          });
        }
      }
    } catch (err) {
      console.error(`同步 ${symbol} 時出錯：`, err.message);
    }
  }

  console.log('配息同步完成 ✅');
}

export default router;
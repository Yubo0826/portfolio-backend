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
    const { uid, portfolio_id } = req.body;

    if (!uid || !portfolio_id) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
      // 同步單一股票的配息紀錄
      await syncDividendsForUserHoldings(uid, portfolio_id);
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
  const transactions = await prisma.transactions.findMany({
    where: {
      uid,
      portfolio_id: Number(portfolioId)
    },
    orderBy: {
      transaction_date: 'asc',
    },
  });

  // 按 symbol 分組，並且找出每支股票的首次購買日
  const symbolGroups = {};
  for (const tx of transactions) {
    if (!symbolGroups[tx.symbol]) {
      symbolGroups[tx.symbol] = {
        date: tx.transaction_date,
        shares: tx.shares,
        name: tx.name,
      };
    } else {
      const existingDate = symbolGroups[tx.symbol].date;
      symbolGroups[tx.symbol] = {
        date: new Date(Math.min(new Date(tx.transaction_date), new Date(existingDate))),
        shares: tx.shares,
        name: tx.name,
      };
    }
  }

  const now = new Date();

  for (const symbol of Object.keys(symbolGroups)) {
    const fromDate = symbolGroups[symbol].date;
    const period1 = fromDate.toISOString().slice(0, 10); // 'YYYY-MM-DD'
    const period2 = now.toISOString().slice(0, 10);      // 'YYYY-MM-DD'

    console.log(`同步 ${symbol} 的配息紀錄，時間範圍：${period1} 到 ${period2}`);

    try {
      const result = await yahooFinance.chart(symbol, {
        period1,
        period2,
        interval: '1d',
        // events: ['dividends'],
      });
      const dividends = result?.events?.dividends ?? [];

      for (const dividend of dividends) {
        const dividendDate = new Date(dividend.date * 1000); // 配息日期
        
        // 計算此配息發生前的持有總股數（所有已完成的交易）
        const sharesAtDividend = transactions
          .filter(tx => tx.symbol === symbol && new Date(tx.transaction_date) <= dividendDate)
          .reduce((total, tx) => {
            const shares = Number(tx.shares) || 0;
            return tx.transaction_type === 'buy' ? total + shares : total - shares;
          }, 0);

        const existing = await prisma.dividends.findFirst({
          where: {
            uid,
            portfolio_id: Number(portfolioId),
            symbol,
            date: new Date(dividend.date * 1000),
          },
        });

        if (!existing) {
          await prisma.dividends.create({
            data: {
              uid,
              portfolio_id: Number(portfolioId),
              symbol,
              name: symbolGroups[symbol].name,
              shares: sharesAtDividend,
              date: dividendDate,
              amount: dividend.amount,
            },
          });
        }
      }
    } catch (err) {
      console.error(`同步 ${symbol} 時出錯：`, err.message);
    }
  }

  console.log('配息同步完成');
}

export {
  router as default,
  syncDividendsForUserHoldings,
};
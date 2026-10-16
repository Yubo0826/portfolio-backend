import express from 'express';
const router = express.Router();
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

import prisma from '../utils/prisma.js';
import { fromQuoteCurrency } from '../utils/currency.js';


router.get('/', async (req, res) => {
  try {
    const { uid, portfolio_id } = req.query;
    if (!uid || !portfolio_id) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const holdings = await prisma.holdings.findMany({
      where: { uid, portfolio_id: Number(portfolio_id) },
    });
    // console.log('Fetched holdings:', holdings);
    res.json(holdings);
  } catch (error) {
    console.error('Error fetching holdings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/refresh-prices', async (req, res) => {
  const { uid, portfolio_id } = req.body;
  
  console.log('Received /api/holdings/refresh-prices request:', { uid, portfolio_id });

  if (!uid || !portfolio_id) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const holdings = await prisma.holdings.findMany({
      where: { uid, portfolio_id: Number(portfolio_id) },
    });

    if (holdings.length === 0) {
      return res.status(404).json({ message: 'No holdings found for this user and portfolio' });
    }

    // 更新每個 holdings 的價格
    const updatedHoldings = await Promise.all(
      holdings.map(async (holding) => {
        const latestPrice = await getLatestPrice(holding.symbol);
        if (latestPrice === null) return holding;
        return prisma.holdings.update({
          where: { id: holding.id },
          data: { current_price: latestPrice, last_updated: new Date() },
        });
      })
    );

    res.json({ message: 'Holdings prices refreshed successfully', holdings: updatedHoldings });
  } catch (error) {
    console.error('Error refreshing holdings prices:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/', async (req, res) => {
  const { ids, portfolio_id, uid } = req.body; // e.g., { ids: [1, 2, 3] }

  console.log('Received /api/holdings delete request:', { uid, ids, portfolio_id });

  if (!uid || !Array.isArray(ids) || ids.length === 0 || !portfolio_id) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // 限定在同一個 portfolio，避免刪 A 組合的持股卻刪到 B 組合同代號的交易
    const holdingsWhere = {
      id: { in: ids.map(Number) },
      uid,
      portfolio_id: Number(portfolio_id),
    };

    // 找出將要刪除的 symbols
    const holdingsToDelete = await prisma.holdings.findMany({
      where: holdingsWhere,
      select: { symbol: true }
    });

    if (holdingsToDelete.length === 0) {
      return res.status(404).json({ message: 'Holdings not found' });
    }

    const txWhere = {
      uid,
      portfolio_id: Number(portfolio_id),
      symbol: { in: holdingsToDelete.map(h => h.symbol) },
    };

    // 持股、交易紀錄在同一個 DB transaction 內
    await prisma.$transaction(async (db) => {
      await db.holdings.deleteMany({ where: holdingsWhere });
      await db.transactions.deleteMany({ where: txWhere });
    });

    const holdings = await prisma.holdings.findMany({
      where: { uid, portfolio_id: Number(portfolio_id) },
    });
    res.json({ message: 'Holdings deleted successfully', holdings });
  } catch (error) {
    console.error('Error deleting holdings:', error);
    res.status(500).json({ message: 'Internal server error' });
  } 
});

// 抓不到價格回傳 null（不是 0），呼叫端應略過更新、保留上次的價格
export const getLatestPrice = async (symbol) => {
  try {
    const data = await yahooFinance.quote(symbol);
    const price = data.regularMarketPrice || data.regularMarketPreviousClose || data.regularMarketOpen || null;
    if (price === null) return null;
    // 倫敦等交易所回的是輔幣（GBp = 便士），換回主幣再存，否則價格會是實際的 100 倍
    return fromQuoteCurrency(price, data.currency).amount;
  } catch (error) {
    console.error('❌ 無法取得最新價格:', symbol, error);
    return null;
  }
};
export default router;
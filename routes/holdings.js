import express from 'express';
const router = express.Router();
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

import { PrismaClient } from '../generated/prisma/index.js';
const prisma = new PrismaClient();

import { reverseCashFlows } from './cashFlows.js';

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
        return prisma.holdings.update({
          where: { id: holding.id },
          data: { current_price: latestPrice },
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

    // 持股、交易紀錄、現金流在同一個 DB transaction 內
    await prisma.$transaction(async (db) => {
      await db.holdings.deleteMany({ where: holdingsWhere });

      // 刪除連動 transactions 前，先扣回它們的現金流
      const txIds = (await db.transactions.findMany({ where: txWhere, select: { id: true } })).map(t => t.id);
      await reverseCashFlows(db, { uid, related_transaction_id: { in: txIds } });
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

const getLatestPrice = async (symbol) => {
  try {
    const data = await yahooFinance.quote(symbol);
    console.log(`Fetched latest price for ${symbol}:`, data);
    return data.regularMarketPrice || data.regularMarketPreviousClose || data.regularMarketOpen || 0;
  } catch (error) {
    console.error('Error fetching latest price:', error);
    throw new Error('Failed to fetch latest price');
  }
};
export default router;
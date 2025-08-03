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
    const holdings = await prisma.holdings.findMany({
      where: { uid, portfolio_id: Number(portfolio_id) },
    });
    console.log('Fetched holdings:', holdings);
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
        // 假設這裡有一個函數可以獲取最新價格
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
    // 找出將要刪除的 symbols
    const holdingsToDelete = await prisma.holdings.findMany({
      where: {
        id: { in: ids.map(Number) },
        uid,
      },
      select: { symbol: true }
    });

    // 刪除 holdings
    const deletedHoldings = await prisma.holdings.deleteMany({
      where: {
        id: { in: ids.map(Number) },
        uid,
      },
    });

    // 刪除連動的 transactions
    await prisma.transactions.deleteMany({
      where: {
        uid: uid,
        portfolio_id: Number(portfolio_id),
        symbol: {
          in: holdingsToDelete.map(h => h.symbol),
        },
      }
    });

    if (deletedHoldings.count === 0) {
      return res.status(404).json({ message: 'Holdings not found' });
    }

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
    console.log(`${symbol} latest price data:`, data.regularMarketPreviousClose);
    return data.regularMarketPreviousClose || data.regularMarketPrice || data.regularMarketOpen || 0;
  } catch (error) {
    console.error('Error fetching latest price:', error);
    throw new Error('Failed to fetch latest price');
  }
};
export default router;
import express from 'express';
const router = express.Router();

import { PrismaClient } from '../generated/prisma/index.js';
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const { uid } = req.query;
    const holdings = await prisma.holdings.findMany({
      where: { uid },
    });
    res.json(holdings);
  } catch (error) {
    console.error('Error fetching holdings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/', async (req, res) => {
  const { uid } = req.query;
  const { ids } = req.body; // e.g., { ids: [1, 2, 3] }

  console.log('Received /api/holdings delete request:', { uid, ids });

  if (!uid || !Array.isArray(ids) || ids.length === 0) {
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
        symbol: {
          in: holdingsToDelete.map(h => h.symbol),
        },
      }
    });

    if (deletedHoldings.count === 0) {
      return res.status(404).json({ message: 'Holdings not found' });
    }

    const holdings = await prisma.holdings.findMany({
      where: { uid },
    });
    res.json({ message: 'Holdings deleted successfully', holdings });
  } catch (error) {
    console.error('Error deleting holdings:', error);
    res.status(500).json({ message: 'Internal server error' });
  } 
});


export default router;
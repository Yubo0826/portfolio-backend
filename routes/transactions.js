import express from 'express';
const router = express.Router();

import { PrismaClient } from '../generated/prisma/index.js';
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const { uid } = req.query;
    const transactions = await prisma.transactions.findMany({
      where: { uid },
    });
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create a new transaction
router.post('/', async (req, res) => {
  console.log('Received transaction data:', req.body);
  try {
    const {
      uid,
      symbol,
      name,
      assetType,
      shares,
      price,
      transaction_type,
      transaction_date,
    } = req.body;

    if (!uid || !symbol || !shares || !price || !transaction_type) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    await prisma.transactions.create({
      data: {
        uid,
        symbol,
        name,
        asset_type: assetType,
        shares,
        price,
        transaction_type: transaction_type,
        transaction_date: transaction_date ? new Date(transaction_date) : undefined,
      },
    });

    // 以下更新 holdings 資料表 
    const existing = await prisma.holdings.findUnique({
      where: {
        uid,
        symbol,
      },
    });

    // 如果是買入操作
    if (transaction_type === 'sell') {
      if (!existing || existing.shares < shares) {
        return res.status(400).json({ message: 'Not enough shares to sell' });
      }
      await prisma.holdings.update({
        where: {
          uid,
          symbol,
        },
        data: {
          total_shares: existing ? existing.total_shares - shares : shares,
          avg_cost: existing ? (existing.avg_cost * existing.total_shares + price * shares) / (existing.total_shares + shares) : price,
          last_updated: new Date(),
        },
      });
    }


    const transactions = await prisma.transactions.findMany({
      where: { uid },
    });
    res.status(201).json(transactions);


  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update a transaction
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    uid,
    symbol,
    name,
    assetType,
    shares,
    price,
    transaction_type,
    transaction_date,
  } = req.body;

  try {
    const updatedTransaction = await prisma.transactions.update({
      where: { id: Number(id) },
      data: {
        uid,
        symbol,
        name,
        asset_type: assetType,
        shares,
        price,
        transaction_type: transaction_type,
        transaction_date: transaction_date ? new Date(transaction_date) : undefined,
      },
    });
    res.json(updatedTransaction);
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete a transaction
router.delete('/', async (req, res) => {
  const { ids } = req.body; // e.g., { ids: [1, 2, 3] }

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty ids array' });
  }

  try {
    await prisma.transactions.deleteMany({
      where: {
        id: { in: ids.map(Number) },
      },
    });
    res.status(204).send('deleted');
  } catch (error) {
    console.error('Error deleting transactions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


export default router;

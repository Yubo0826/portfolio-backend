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
      transactionType,
      transactionDate,
    } = req.body;

    if (!uid || !symbol || !shares || !price || !transactionType) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // const totalAmount = shares * price;

    await prisma.transactions.create({
      data: {
        uid,
        symbol,
        name,
        asset_type: assetType,
        shares,
        price,
        transaction_type: transactionType,
        transaction_date: transactionDate ? new Date(transactionDate) : undefined,
        // totalAmount,
      },
    });

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
    transactionType,
    transactionDate,
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
        transaction_type: transactionType,
        transaction_date: transactionDate ? new Date(transactionDate) : undefined,
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

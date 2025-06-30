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

    const newTransaction = await prisma.transactions.create({
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

    res.status(201).json(newTransaction);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;

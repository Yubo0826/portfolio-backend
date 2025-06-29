import express from 'express';
const router = express.Router();

import { PrismaClient } from '../generated/prisma/index.js';
const prisma = new PrismaClient();

router.post('/', async (req, res) => {
  console.log('Received transaction data:', req.body);
  try {
    const {
      userId,
      symbol,
      shares,
      price,
      transactionType,
      transactionDate,
    } = req.body;

    if (!userId || !symbol || !shares || !price || !transactionType) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // const totalAmount = shares * price;

    const newTransaction = await prisma.transactions.create({
      data: {
        userId,
        symbol,
        shares,
        price,
        transactionType,
        transactionDate: transactionDate ? new Date(transactionDate) : undefined,
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

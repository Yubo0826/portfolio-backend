// server.js
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cors from 'cors';

import { PrismaClient } from './generated/prisma/index.js';
const prisma = new PrismaClient();

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors()); // 允許所有來源 CORS
app.use(express.json()); //自動解析 Content-Type: application/json 的請求 body

app.get('/api/tiingo/:symbol', async (req, res) => {
  const symbol = req.params.symbol;
  const { date } = req.query;
  const apiKey = process.env.TIINGO_API_KEY;

  const url = `https://api.tiingo.com/tiingo/daily/${symbol}/prices?startDate=${date}&endDate=${date}&token=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Tiingo fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch data from Tiingo' });
  }
});

app.post('/api/transactions', async (req, res) => {
  console.log('Received transaction data:', req.body);
  try {
    const {
      uid,
      symbol,
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

app.post('/api/user', async (req, res) => {
  console.log('Received /api/user data:', req.body);
  try {
    const {
      uid,
      email,
      displayName
    } = req.body;

    if (!uid || !email) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // 檢查是否已有該使用者
    const existingUser = await prisma.users.findUnique({
      where: { uid },
    });

    console.log('Existing user:', existingUser);

    if (existingUser) {
      return res.status(200).json({ message: 'User already exists' });
    }

    const newUser = await prisma.users.create({
        data: {
          uid,
          email,
          display_name: displayName
        },
      });
      res.status(201).json({ message: 'User created', user: newUser });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Tiingo Proxy Server running at http://localhost:${PORT}`);
});

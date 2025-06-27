// server.js
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

import { PrismaClient } from './generated/prisma/index.js';
const prisma = new PrismaClient();

import transactionsRoute from './routes/transactions.js';
import userRoute from './routes/user.js';
import tiingoRoute from './routes/tiingo/prices.js';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors()); // 允許所有來源 CORS
app.use(express.json()); //自動解析 Content-Type: application/json 的請求 body

// 將 Prisma 傳給每個 route（如果需要）
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// 路由掛載
app.use('/api/tiingo', tiingoRoute);
app.use('/api/transactions', transactionsRoute);
app.use('/api/user', userRoute);

app.listen(PORT, () => {
  console.log(`🚀 Tiingo Proxy Server running at http://localhost:${PORT}`);
});

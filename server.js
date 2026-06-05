// server.js
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

import { PrismaClient } from './generated/prisma/index.js';
const prisma = new PrismaClient();

dotenv.config();

const app = express();

const allowedOrigins = [
  'https://stockbar.up.railway.app'
];

// 開發環境允許本地端存取，/env 裡設定 NODE_ENV="development"
if (process.env.NODE_ENV === 'development') {
  // 開發模式下，允許所有 localhost port（Vite 可能會跳 port）
  allowedOrigins.push(/^http:\/\/localhost:\d+$/);
  allowedOrigins.push(/^http:\/\/127\.0\.0\.1:\d+$/);
}

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false, // 自動處理 OPTIONS
}));

app.use(express.json()); //自動解析 Content-Type: application/json 的請求 body

// 將 Prisma 傳給每個 route（如果需要）
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

import task from './jobs/dailyPortfolioCheck.js' // 每日投資組合偏差檢查服務

task.start(); // 啟動每日任務

import transactionsRoute from './routes/transactions.js';
import userRoute from './routes/users.js';
import searchRoute from './routes/tiingo/search.js';
import holdingsRoute from './routes/holdings.js';
import portfolioRoute from './routes/portfolio.js';
import allocationRoute from './routes/allocation.js';
import yahooFinanceRoute from './routes/yahooFinance.js';
import dividendsRoute from './routes/dividends.js';
import cashAccountsRoute from './routes/cashAccounts.js';
import cashFlowsRoute from './routes/cashFlows.js';

// 路由掛載
app.use('/api/transactions', transactionsRoute);
app.use('/api/user', userRoute);
app.use('/api/search', searchRoute);
app.use('/api/holdings', holdingsRoute);
app.use('/api/portfolio', portfolioRoute);
app.use('/api/allocation', allocationRoute);
app.use('/api/yahoo', yahooFinanceRoute);
app.use('/api/dividends', dividendsRoute);
app.use('/api/cash-accounts', cashAccountsRoute);
app.use('/api/cash-flows', cashFlowsRoute);


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
      🚀 =============== ============== =============== 🚀
      🚀 =============== Server running =============== 🚀
      🚀 =============== ============== =============== 🚀
    `);
});

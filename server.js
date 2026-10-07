// server.js
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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

// 驗證 Firebase ID token，並用驗證後的 uid 覆蓋 client 傳來的 uid
// ponytail: route 仍然讀 req.query.uid / req.body.uid，這裡統一覆寫，不用逐一改每個 route
// 沒帶 token 視為未登入的 demo 帳號（前端 stores/auth.ts 的 demo-user），demo 資料任何人都能改
initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'asset-profolio-tracker' });
const DEMO_UID = 'demo-user';

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  let uid = DEMO_UID, email;
  if (token) {
    try {
      ({ uid, email } = await getAuth().verifyIdToken(token));
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  }
  // Express 5 的 req.query 是每次重新解析的 getter，要蓋成固定值才改得動
  Object.defineProperty(req, 'query', { value: { ...req.query, uid }, writable: true });
  if (req.body && typeof req.body === 'object') req.body.uid = uid;
  req.user = { uid, email };
  next();
};

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

// 路由掛載（有讀寫使用者資料的都要過 authenticate）
app.use('/api/transactions', authenticate, transactionsRoute);
app.use('/api/user', authenticate, userRoute);
app.use('/api/search', searchRoute);
app.use('/api/holdings', authenticate, holdingsRoute);
app.use('/api/portfolio', authenticate, portfolioRoute);
app.use('/api/allocation', authenticate, allocationRoute);
app.use(['/api/yahoo/holdings-chart', '/api/yahoo/allocation-chart'], authenticate);
app.use('/api/yahoo', yahooFinanceRoute);
app.use('/api/dividends', authenticate, dividendsRoute);
app.use('/api/cash-accounts', authenticate, cashAccountsRoute);
app.use('/api/cash-flows', authenticate, cashFlowsRoute);


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
      🚀 =============== ============== =============== 🚀
      🚀 =============== Server running =============== 🚀
      🚀 =============== ============== =============== 🚀
    `);
});

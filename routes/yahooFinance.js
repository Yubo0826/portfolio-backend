import express from 'express';
import fetch from 'node-fetch';
import yahooFinance from 'yahoo-finance2';

const router = express.Router();

import { PrismaClient } from '../generated/prisma/index.js';
const prisma = new PrismaClient();

// 搜尋股票代碼（模糊查詢）
router.get('/symbol', async (req, res) => {
    const { query } = req.query;
    console.log('Received /api/yahooFinance/symbol request:', query);
  try {
    const result = await yahooFinance.search(query);
    const validQuotes = result.quotes.filter(q => q.isYahooFinance && q.symbol);
    res.json(validQuotes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 即時報價
router.get('/quote', async (req, res) => {
    const { symbol } = req.query;
    console.log('Received /api/yahooFinance/quote request:', req.query);
  try {
    const result = await yahooFinance.quote(symbol);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 歷史股價（chart）
router.get('/chart', async (req, res) => {
    const { symbol, period1, period2, interval = '1d' } = req.query;
    console.log('Received /api/yahooFinance/chart request:', req.query);
  try {
    const result = await yahooFinance.chart(symbol, { period1, period2, interval });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 使用者holdings的歷史股價
router.get('/holdings-chart', async (req, res) => {
    const { uid, portfolio_id, period1, period2, interval = '1d' } = req.query;
    console.log('Received /api/yahooFinance/holdings-chart request:', req.query);
    if (!uid || !portfolio_id) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    try {
      const holdings = await prisma.holdings.findMany({
        where: { uid, portfolio_id: Number(portfolio_id) },
      });

      console.log('Fetched holdings for chart:', holdings);

      if (!holdings || holdings.length === 0) {
        return res.status(404).json({ message: 'No holdings found' });
      }

      const symbols = holdings.map(h => h.symbol);
      
      // 拉每一檔歷史
      const symbolsData = await Promise.all(symbols.map(async (symbol) => {
        return yahooFinance.chart(symbol, { period1, period2, interval });
      }));

      // 把每檔歷史股價合併
      const mergedData = {};
      symbolsData.forEach((data, index) => {
        if (!data || !data.timestamp) return;
        data.timestamp.forEach((time, i) => {
          const price = data.indicators.quote[0].close[i];
          if (price != null) {
            mergedData[time] = (mergedData[time] || 0) + price;
          }
        });
      });

      res.json(mergedData);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});

// 公司財報摘要
router.get('/summary', async (req, res) => {
    const { symbol } = req.query;
    console.log('Received /api/yahooFinance/summary request:', req.query);
  const modules = ['summaryProfile', 'financialData', 'price']; // 可根據需要擴充
  try {
    const result = await yahooFinance.quoteSummary(symbol, { modules });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 熱門股票
router.get('/trending', async (req, res) => {
    const { region = 'US' } = req.query;
    console.log('Received /api/yahooFinance/trendingSymbols request:', req.query);
  try {
    const result = await yahooFinance.trendingSymbols(region);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 推薦股票
router.get('/recommend', async (req, res) => {
    const { symbol } = req.query;
    console.log('Received /api/yahooFinance/recommend request:', req.query);
  try {
    const result = await yahooFinance.recommendationsBySymbol(symbol);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


export default router;
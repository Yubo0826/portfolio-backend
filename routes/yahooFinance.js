import express from 'express';
import fetch from 'node-fetch';
import yahooFinance from 'yahoo-finance2';

const router = express.Router();

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
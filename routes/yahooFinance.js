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

// 取得user holdings的歷史總價
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

      if (!holdings || holdings.length === 0) {
        return res.status(404).json({ message: 'No holdings found' });
      }

      const symbols = holdings.map(h => h.symbol);
      
      // 拉每一檔歷史
      const symbolDataArray = await Promise.all(symbols.map(async (symbol) => {
        return yahooFinance.chart(symbol, { period1, period2, interval });
      }));

      // 儲存每個日期的 close 總和
      const mergedDataMap = {};

      // 處理每個股票的 quotes 陣列
      symbolDataArray.forEach(stock => {
        // console.log('Processing stock:', stock);
        stock.quotes.forEach(quote => {
          // console.log('Processing quote:', quote.date, 'Close:', quote.close);
          const date = quote.date.toISOString().split('T')[0]; // 取 '2025-01-08' 的格式
          if (!mergedDataMap[date]) {
            mergedDataMap[date] = 0;
          }
          mergedDataMap[date] += quote.close;
        });
      });

      // 轉換為特定格式的陣列
      const mergedDataArray = Object.entries(mergedDataMap).map(([date, close]) => ({
        date,
        close: parseFloat(close.toFixed(2)) // 保留小數點兩位
      }));

      res.json(
        mergedDataArray // 回傳格式為 [{ date: '2025-01-08', close: 123.45 }, ...]
      );
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});

// 拿 user allocation 的歷史股價
router.get('/allocation-chart', async (req, res) => {
    const { uid, portfolio_id, period1, period2, interval = '1d' } = req.query;
    console.log('Received /api/yahooFinance/allocation-chart request:', req.query);
    if (!uid || !portfolio_id) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    try {
      const allocations = await prisma.allocation.findMany({
        where: { uid, portfolio_id: Number(portfolio_id) },
      });
      if (!allocations || allocations.length === 0) {
        return res.status(404).json({ message: 'No allocations found' });
      }
      const symbols = allocations.map(a => a.symbol);
      // console.log('Fetching data for symbols:', symbols);

      // 拉每一檔區間內的歷史股價
      const symbolDataArray = await Promise.all(symbols.map(async (symbol) => {
        return yahooFinance.chart(symbol, { period1, period2, interval });
      }));

      // console.log('Fetched symbol data:', symbolDataArray);
      
      const data = {};
      symbols.forEach((symbol, index) => {
        data[symbol] = symbolDataArray[index].quotes.map(quote => ({
          date: quote.date.toISOString().split('T')[0],
          close: quote.adjclose
        }));
      });

      // console.log('Allocation chart data:', data);

      res.json(
        data // 回傳格式為 { AAPL: [{ date: '2025-01-08', close: 123.45 }, ...], MSFT: [...], ... }
      );
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
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
  const { uid, portfolio_id, interval = '1d' } = req.query;
  let { period1, period2 } = req.query;

  try {
    if (!uid || !portfolio_id) {
      return res.status(400).json({ message: 'Missing required fields: uid, portfolio_id' });
    }
    if (!['1d', '1wk', '1mo'].includes(interval)) {
      return res.status(400).json({ message: 'interval must be one of 1d | 1wk | 1mo' });
    }

    // 1) 抓此 portfolio 的所有交易（依日期排序）
    const txs = await prisma.transactions.findMany({
      where: { uid, portfolio_id: Number(portfolio_id) },
      orderBy: { transaction_date: 'asc' }
    });

    if (!txs || txs.length === 0) {
      return res.status(404).json({ message: 'No transactions found' });
    }

    // 2) 期間處理：若沒給 period1/period2，預設用最早交易日 ~ 今天
    const earliestTxDate = new Date(txs[0].transaction_date);
    const defaultStart = new Date(Date.UTC(
      earliestTxDate.getUTCFullYear(),
      earliestTxDate.getUTCMonth(),
      earliestTxDate.getUTCDate()
    ));
    const defaultEnd = new Date(); // now

    const parseDateParam = (v, fallback) => {
      if (!v) return fallback;
      // 支援：毫秒/秒 timestamp、'YYYY-MM-DD'、ISO 字串
      if (typeof v === 'string' && /^\d+$/.test(v)) {
        const num = Number(v);
        // 粗略判斷長度：10位(秒) -> *1000，13位(毫秒) -> 直接用
        return new Date(num < 1e12 ? num * 1000 : num);
      }
      const d = new Date(v);
      return isNaN(d) ? fallback : d;
    };

    const startDate = parseDateParam(period1, defaultStart);
    const endDate = parseDateParam(period2, defaultEnd);
    if (startDate > endDate) {
      return res.status(400).json({ message: 'period1 must be <= period2' });
    }

    // 3) 交易分組（按 symbol），同時規範 type 為 buy/sell
    const txBySymbol = {};
    for (const tx of txs) {
      const symbol = tx.symbol;
      const type = String(tx.transaction_type || '').toLowerCase();
      if (!txBySymbol[symbol]) txBySymbol[symbol] = [];
      txBySymbol[symbol].push({
        date: new Date(tx.transaction_date),
        shares: Number(tx.shares),
        type
      });
    }
    // 每個 symbol 的交易依日期排序（保險起見）
    for (const s of Object.keys(txBySymbol)) {
      txBySymbol[s].sort((a, b) => a.date - b.date);
    }

    const symbols = Object.keys(txBySymbol);
    if (symbols.length === 0) {
      return res.status(404).json({ message: 'No symbols found from transactions' });
    }

    // 4) 下載所有標的的歷史價（同一期間、同一 interval）
    const yfOpts = { period1: startDate, period2: endDate, interval };
    const priceMapBySymbol = {}; // { AAPL: Map<'YYYY-MM-DD', close> }
    const dateSet = new Set();   // 統一的日期集合（字串 YYYY-MM-DD）

    const toDateKeyUTC = (d) => {
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    // 下載價格（並建立每檔的 date->close map，同時蒐集所有日期）
    await Promise.all(symbols.map(async (symbol) => {
      try {
        const chart = await yahooFinance.chart(symbol, yfOpts);
        const quotes = chart?.quotes || [];
        const map = new Map();
        for (const q of quotes) {
          if (q.close == null || !q.date) continue;
          const dk = toDateKeyUTC(new Date(q.date));
          map.set(dk, Number(q.close));
          dateSet.add(dk);
        }
        priceMapBySymbol[symbol] = map;

        // TODO: 若要支援 split 對 shares 的影響，可處理 chart.events?.splits
        // 依你的資料源是否另有 split 入帳，再決定是否在此調整持股。
      } catch (e) {
        // 單一 symbol 失敗不讓整體失敗，但列警示
        console.warn(`[holdings-chart] Failed to fetch chart for ${symbol}:`, e?.message || e);
        priceMapBySymbol[symbol] = new Map();
      }
    }));

    // 沒有任何價格資料
    if (dateSet.size === 0) {
      return res.status(404).json({ message: 'No price data for the given period' });
    }

    // 5) 生成排序後的日期清單（使用價格的交易日，不含週末/休市）
    const dates = Array.from(dateSet).sort(); // 'YYYY-MM-DD' 字串排序即時間排序

    // 6) 以「移動指標」方式累積每檔的持股，逐日計算 Portfolio 總市值
    const runningShares = {};  // { AAPL: 0, ... }
    const txIndex = {};        // { AAPL: 0, ... }
    const lastPrice = {};      // { AAPL: lastKnownClose, ... }

    for (const s of symbols) {
      runningShares[s] = 0;
      txIndex[s] = 0;
      lastPrice[s] = undefined;
    }

    // 把交易日期也轉成 'YYYY-MM-DD' 方便 <= 比較
    const txBySymbolDateKeyed = {};
    for (const s of symbols) {
      txBySymbolDateKeyed[s] = txBySymbol[s].map(t => ({
        ...t,
        dk: toDateKeyUTC(t.date)
      }));
    }

    const result = []; // [{ date, value, close }]

    for (const dk of dates) {
      // 6-1) 先把「交易日 <= 當日」的交易吃進 runningShares
      for (const s of symbols) {
        const list = txBySymbolDateKeyed[s];
        let idx = txIndex[s];
        while (idx < list.length && list[idx].dk <= dk) {
          const t = list[idx];
          if (t.type === 'buy') {
            runningShares[s] += t.shares;
          } else if (t.type === 'sell') {
            runningShares[s] -= t.shares;
          } else {
            // 其他型別忽略，或依你的定義處理
          }
          idx++;
        }
        txIndex[s] = idx;
      }

      // 6-2) 計算當日 Portfolio 總市值 = Σ (shares × close)
      let dayValue = 0;

      for (const s of symbols) {
        const priceMap = priceMapBySymbol[s];
        let px = priceMap.get(dk);

        // 若該日該檔無價，沿用前一個已知價（forward fill）
        if (px == null) px = lastPrice[s];
        if (px == null) continue; // 仍然沒有就跳過

        lastPrice[s] = px;

        const shares = runningShares[s];
        if (!shares) continue;
        dayValue += shares * px;
      }

      // 輸出（保留兩位小數）
      const rounded = Math.round(dayValue * 100) / 100;
      result.push({ date: dk, value: rounded, close: rounded });
    }

    // 只回傳有意義的資料點（避免全 0）
    const trimmed = result.filter(p => p.value !== 0 || result.length <= 2);

    return res.json(trimmed);
  } catch (error) {
    console.error('[holdings-chart] Error:', error);
    return res.status(500).json({ error: error?.message || 'Internal Server Error' });
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
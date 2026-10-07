import express from 'express';
import YahooFinance from 'yahoo-finance2';
import prisma from '../utils/prisma.js';

const yahooFinance = new YahooFinance();
const router = express.Router();

// demo 帳號所有訪客共用，只能看不能改
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.query.uid === 'demo-user') {
    return res.status(403).json({ message: 'Please sign in to edit the watchlist' });
  }
  next();
});

const normalizeSymbol = (symbol) => String(symbol ?? '').trim().toUpperCase();

// 取得關注清單，並一次批次抓報價
router.get('/', async (req, res) => {
  const { uid } = req.query;
  try {
    const rows = await prisma.watchlist.findMany({ where: { uid }, orderBy: { created_at: 'asc' } });

    let quotes = [];
    if (rows.length) {
      try {
        quotes = await yahooFinance.quote(rows.map(r => r.symbol), { return: 'array' });
      } catch (error) {
        // 報價抓不到也要回清單，價格欄位給 null
        console.error('❌ 關注清單報價失敗:', error?.message || error);
      }
    }
    const quoteMap = new Map(quotes.map(q => [q.symbol, q]));

    res.json(rows.map(row => {
      const q = quoteMap.get(row.symbol);
      return {
        ...row,
        regularMarketPrice: q?.regularMarketPrice ?? null,
        regularMarketChange: q?.regularMarketChange ?? null,
        regularMarketChangePercent: q?.regularMarketChangePercent ?? null,
        currency: q?.currency ?? null,
      };
    }));
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 加入關注，重複加入不報錯
router.post('/', async (req, res) => {
  const { uid, name = null, asset_type = null } = req.body;
  const symbol = normalizeSymbol(req.body.symbol);
  if (!symbol || symbol.length > 10) return res.status(400).json({ message: 'Invalid symbol' });

  try {
    const item = await prisma.watchlist.upsert({
      where: { uid_symbol: { uid, symbol } },
      update: {},
      create: { uid, symbol, name, asset_type },
    });
    res.json(item);
  } catch (error) {
    console.error('Error adding watchlist item:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 設定目標價；target_price 傳 null 代表取消通知。改目標價會重新啟用通知
router.put('/:symbol', async (req, res) => {
  const { uid, target_price, alert_above } = req.body;
  const symbol = normalizeSymbol(req.params.symbol);
  const target = target_price == null ? null : Number(target_price);
  if (target !== null && !(Number.isFinite(target) && target > 0)) {
    return res.status(400).json({ message: 'Invalid target price' });
  }

  try {
    const item = await prisma.watchlist.update({
      where: { uid_symbol: { uid, symbol } },
      data: {
        target_price: target,
        alert_above: target === null ? null : Boolean(alert_above),
        alerted_at: null,
      },
    });
    res.json(item);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Not found' });
    console.error('Error updating watchlist item:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:symbol', async (req, res) => {
  const { uid } = req.query;
  try {
    await prisma.watchlist.deleteMany({ where: { uid, symbol: normalizeSymbol(req.params.symbol) } });
    res.json({ message: 'Deleted' });
  } catch (error) {
    console.error('Error deleting watchlist item:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;

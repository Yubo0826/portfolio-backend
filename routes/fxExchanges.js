import express from 'express';
import prisma from '../utils/prisma.js';
import { SUPPORTED_CURRENCIES } from '../services/fx.js';
import { buildFxRateLookup } from '../services/fxHistory.js';

const router = express.Router();

// 驗證並正規化前端送來的換匯紀錄；不合法回傳 null
export const parseExchange = (body) => {
  const side = body?.side;
  const currency = String(body?.currency ?? '').trim().toUpperCase();
  const foreign_amount = Number(body?.foreign_amount);
  const twd_amount = Number(body?.twd_amount);
  const fee = Number(body?.fee ?? 0);
  const date = new Date(body?.date);
  const note = body?.note ? String(body.note).slice(0, 255) : null;

  if (side !== 'buy' && side !== 'sell') return null;
  if (currency === 'TWD' || !SUPPORTED_CURRENCIES.includes(currency)) return null;
  if (!(foreign_amount > 0) || !(twd_amount > 0) || !(fee >= 0)) return null;
  if (Number.isNaN(date.getTime()) || date > new Date()) return null;

  return { side, currency, foreign_amount, twd_amount, fee, date, note };
};

// 當天市場匯率：1 外幣 = ? TWD（Yahoo 以 USD 為基準，經 USD 交叉換算）
const marketRateOf = async (currency, date) => {
  const lookup = await buildFxRateLookup([{ currency, date }, { currency: 'TWD', date }]);
  const foreignPerUsd = lookup(currency, date);
  const twdPerUsd = lookup('TWD', date);
  return foreignPerUsd > 0 && twdPerUsd > 0 ? twdPerUsd / foreignPerUsd : null;
};

router.get('/', async (req, res) => {
  try {
    const rows = await prisma.fx_exchanges.findMany({
      where: { uid: req.query.uid },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    res.json(rows);
  } catch (error) {
    console.error('Error fetching fx exchanges:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  const data = parseExchange(req.body);
  if (!data) return res.status(400).json({ message: 'Invalid exchange' });

  try {
    const market_rate = await marketRateOf(data.currency, data.date);
    const row = await prisma.fx_exchanges.create({ data: { ...data, market_rate, uid: req.body.uid } });
    res.json(row);
  } catch (error) {
    console.error('Error creating fx exchange:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const data = parseExchange(req.body);
  if (!Number.isInteger(id) || !data) return res.status(400).json({ message: 'Invalid exchange' });

  try {
    const old = await prisma.fx_exchanges.findFirst({ where: { id, uid: req.body.uid } });
    if (!old) return res.status(404).json({ message: 'Not found' });

    // 日期與幣別沒變就沿用舊的市場匯率，不必再打 Yahoo
    const dayOf = (d) => d.toISOString().slice(0, 10);
    const sameBasis = old.currency === data.currency && dayOf(old.date) === dayOf(data.date);
    const market_rate = sameBasis ? old.market_rate : await marketRateOf(data.currency, data.date);
    const row = await prisma.fx_exchanges.update({ where: { id }, data: { ...data, market_rate } });
    res.json(row);
  } catch (error) {
    console.error('Error updating fx exchange:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.fx_exchanges.deleteMany({ where: { id: Number(req.params.id), uid: req.query.uid } });
    res.json({ message: 'Deleted' });
  } catch (error) {
    console.error('Error deleting fx exchange:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;

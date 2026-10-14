import express from 'express';
const router = express.Router();

import prisma from '../utils/prisma.js';


// 製作副本用：去掉 id 讓 DB 重新編號，改掛到新組合
// ponytail: 現金流功能已移除但 cash_account_id 欄位還在 DB，副本一律清空，drop 欄位時這裡一起拿掉
export const copyRows = (rows, portfolioId) =>
  rows.map(({ id, portfolio_id, cash_account_id, ...rest }) => ({ ...rest, portfolio_id: portfolioId }));

router.get('/', async (req, res) => {
  try {
    const { uid } = req.query;
    // 一併帶回計算市值所需的最小持股欄位，避免列表頁對每個組合各打一次 /api/holdings。
    // 注意：市值不在後端加總 —— 後端不知道使用者的顯示幣別，也沒有匯率，
    // 各列幣別不同時相加會得到台幣加美金的無意義數字（參考 services/portfolioService.js 的反例）。
    const portfolios = await prisma.portfolios.findMany({
      where: { uid },
      include: {
        holdings: {
          select: {
            currency: true,
            current_price: true,
            total_shares: true,
          },
        },
      },
    });

    portfolios.forEach(p => {
      p.drift_threshold = p.drift_threshold ? Number(p.drift_threshold) * 100 : null;
    });

    res.json({
      portfolios,
    });
  } catch (error) {
    console.error('Error fetching portfolios:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  console.log('Received /api/portfolio post request:', req.body);
  const { 
    uid,
    name,
    description,
    drift_threshold,
    enable_email_alert,
    source_id, // 製作副本時帶入來源組合 id，一併複製交易、持股、目標配置與股息
  } = req.body;

  if (!uid || !name) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    if (source_id && !await prisma.portfolios.findFirst({ where: { id: Number(source_id), uid } })) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }

    const newPortfolio = await prisma.$transaction(async (db) => {
      const created = await db.portfolios.create({
        data: {
          uid,
          name,
          description,
          drift_threshold: drift_threshold ? Number(drift_threshold) / 100 : null,
          enable_email_alert
        },
      });
      if (!source_id) return created;

      const where = { uid, portfolio_id: Number(source_id) };
      for (const table of ['transactions', 'holdings', 'allocation', 'dividends']) {
        const rows = await db[table].findMany({ where });
        if (rows.length) await db[table].createMany({ data: copyRows(rows, created.id) });
      }
      // 帶回持股，列表頁才能立即算出副本的檔數與市值
      created.holdings = await db.holdings.findMany({
        where: { portfolio_id: created.id },
        select: { currency: true, current_price: true, total_shares: true },
      });
      return created;
    }, { timeout: 60000 });

    newPortfolio.drift_threshold = newPortfolio.drift_threshold ? Number(newPortfolio.drift_threshold) * 100 : null;
    
    res.status(200).json({
      message: 'Portfolio saved successfully',
      portfolio: newPortfolio,
    });
  } catch (error) {
    console.error('Error saving portfolio:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/', async (req, res) => {
  console.log('Received /api/portfolio put request:', req.body);
  const {
    id,
    uid,
    name,
    description,
    drift_threshold,
    enable_email_alert
  } = req.body;

  if (!id || !name) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const owned = await prisma.portfolios.findFirst({ where: { id: Number(id), uid } });
    if (!owned) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }

    const updatedPortfolio = await prisma.portfolios.update({
      where: { id: Number(id) },
      data: {
        name,
        description,
        drift_threshold: drift_threshold ? Number(drift_threshold) / 100 : null,
        enable_email_alert,
        drift_alerted_at: null, // 改設定後重新啟用偏差通知
      },
    });

    updatedPortfolio.drift_threshold = updatedPortfolio.drift_threshold ? Number(updatedPortfolio.drift_threshold) * 100 : null;

    res.status(200).json({
      message: 'Portfolio updated successfully',
      portfolio: updatedPortfolio,
    });
  } catch (error) {
    console.error('Error updating portfolio:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/', async (req, res) => {
  const { ids, uid } = req.body;
  console.log('Received /api/portfolio delete request:', ids, uid);
  if (!uid || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  try {
    // 確認 ids 所屬的 uid 是否正確
    const portfolios = await prisma.portfolios.findMany({
      where: {
        id: { in: ids.map(Number) },
        uid,
      },
    });
    if (portfolios.length !== ids.length) {
      return res.status(404).json({ message: 'Some portfolios not found for the user' });
    }
    await prisma.$transaction(async (db) => {
      // holdings / transactions / dividends / allocation 由 FK onDelete: Cascade 一併刪除
      await db.portfolios.deleteMany({
        where: {
          id: { in: ids.map(Number) },
          uid,
        },
      });
    });

    res.json({ message: 'Portfolios deleted successfully' });
  } catch (error) {
    console.error('Error deleting portfolios:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
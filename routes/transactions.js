import express from 'express';
const router = express.Router();

import prisma from '../utils/prisma.js';

import { recalcHolding, validateTransaction } from '../services/holdingCalc.js';
import { syncDividendsForUserHoldings } from './dividends.js';

router.get('/', async (req, res) => {
  try {
    const { uid, portfolio_id } = req.query;
    if (!uid || !portfolio_id) {
      return res.status(400).json({ message: 'Missing required fields' });
    } 
    const transactions = await prisma.transactions.findMany({
      where: { 
        uid, 
        portfolio_id: Number(portfolio_id)
       },
    });
    const holdings = await prisma.holdings.findMany({
      where: { 
        uid, 
        portfolio_id: Number(portfolio_id)
       },
    });
    res.json({
      transactions,
      holdings,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create a new transaction
router.post('/', async (req, res) => {
  console.log('Received transaction data:', req.body);
  try {
    const {
      uid,
      portfolio_id,
      symbol,
      name,
      asset_type,
      shares,
      price,
      currency,
      fee,
      transaction_type,
      transaction_date,
    } = req.body;

    const normalizedPortfolioId = Number(portfolio_id);

    if (!uid || !portfolio_id || !Number.isInteger(normalizedPortfolioId)) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const invalid = validateTransaction(req.body);
    if (invalid) return res.status(400).json({ message: invalid });
    if (!await prisma.portfolios.findFirst({ where: { id: normalizedPortfolioId, uid } })) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }

    // 新增交易紀錄
    const transactionData = {
      users: { connect: { uid } }, // 連接到使用者
      portfolios: { connect: { id: normalizedPortfolioId } },
      symbol,
      name,
      asset_type,
      shares,
      price,
      currency: currency || 'USD',
      fee,
      transaction_type,
      transaction_date: transaction_date ? new Date(transaction_date) : undefined,
    };

    // 持股、交易紀錄在同一個 DB transaction 內，任一步失敗全部回滾
    await prisma.$transaction(async (db) => {
      await db.transactions.create({
        data: transactionData,
      });
      await recalcHolding(db, uid, normalizedPortfolioId, symbol);
    });

    // 回傳新的所有交易紀錄
    const transactions = await prisma.transactions.findMany({
      where: { 
        uid, 
        portfolio_id: normalizedPortfolioId
       },
    });
    const holdings = await prisma.holdings.findMany({
      where: { 
        uid, 
        portfolio_id: normalizedPortfolioId
       },
    });
    // 交易變動後背景重算配息（不等 Yahoo 回應）
    syncDividendsForUserHoldings(uid, normalizedPortfolioId).catch(err => console.error('配息同步失敗:', err));
    res.status(201).json({
      message: 'Transaction created successfully',
      transactions,
      holdings,
    });

  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    console.error('Error creating transaction:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Bulk create transactions
router.post('/bulk', async (req, res) => {
  console.log('Received bulk transaction data:', req.body);
  try {
    const { uid, portfolio_id, transactions } = req.body;
    const normalizedPortfolioId = Number(portfolio_id);

    if (!uid || !portfolio_id || !Number.isInteger(normalizedPortfolioId) || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ message: 'Missing required fields or transactions array is empty' });
    }
    // 任一筆不合法就整批退回，不默默略過（略過會讓使用者以為全部匯入成功）
    for (const [i, tx] of transactions.entries()) {
      const invalid = validateTransaction(tx);
      if (invalid) return res.status(400).json({ message: `Row ${i + 1}: ${invalid}` });
    }
    if (!await prisma.portfolios.findFirst({ where: { id: normalizedPortfolioId, uid } })) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }

    // 整批匯入為單一 DB transaction，任一筆失敗全部回滾
    // ponytail: 逐筆循序 create，timeout 設 60s；若匯入量大到超時，改用 createMany
    await prisma.$transaction(async (db) => {
      const symbols = new Set();
      for (const tx of transactions) {
        const {
          symbol,
          name,
          asset_type,
          shares,
          price,
          currency,
          fee,
          transaction_type,
          transaction_date,
        } = tx;

        symbols.add(symbol);

        // 新增交易紀錄
        await db.transactions.create({
          data: {
            users: { connect: { uid } }, // 連接到使用者
            portfolios: { connect: { id: normalizedPortfolioId } },
            symbol,
            name,
            asset_type,
            shares,
            price,
            currency: currency || 'USD',
            fee,
            transaction_type,
            transaction_date: transaction_date ? new Date(transaction_date) : undefined,
          },
        });
      }
      for (const symbol of symbols) await recalcHolding(db, uid, normalizedPortfolioId, symbol);
    }, { timeout: 60000 });

    // 回傳新的所有交易紀錄
    const allTransactions = await prisma.transactions.findMany({
      where: { 
        uid, 
        portfolio_id: normalizedPortfolioId
       },
    });
    const holdings = await prisma.holdings.findMany({
      where: { 
        uid, 
        portfolio_id: normalizedPortfolioId
       },
    });
    // 匯入是一次性大量變動且前端有 loading，等配息算完再回應，前端匯入後才抓得到利息記錄
    await syncDividendsForUserHoldings(uid, normalizedPortfolioId).catch(err => console.error('配息同步失敗:', err));
    res.status(201).json({
      message: 'success',
      transactions: allTransactions,
      holdings,
    });

  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    console.error('Error creating bulk transactions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update a transaction
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    uid,
    portfolio_id,
    symbol,
    shares,
    fee,
    price,
    currency,
    transaction_type,
    transaction_date,
  } = req.body;
  const normalizedPortfolioId = Number(portfolio_id);

  try {
    if (!uid || !portfolio_id || !Number.isInteger(normalizedPortfolioId)) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const invalid = validateTransaction(req.body);
    if (invalid) return res.status(400).json({ message: invalid });

    // 找到舊的交易紀錄
    const oldTransaction = await prisma.transactions.findFirst({
      where: { id: Number(id), uid },
    });
    if (!oldTransaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    await prisma.$transaction(async (db) => {
      await db.transactions.update({
        where: { id: Number(id) },
        data: {
          shares,
          price,
          currency: currency || 'USD',
          fee: fee || 0,
          transaction_type,
          transaction_date: transaction_date ? new Date(transaction_date) : undefined,
        },
      });

      // 交易不會改 symbol / portfolio，所以以舊交易的為準重算持股
      await recalcHolding(db, uid, oldTransaction.portfolio_id, oldTransaction.symbol);
    });
    
    const transactions = await prisma.transactions.findMany({
      where: { 
        uid, 
        portfolio_id: normalizedPortfolioId
       },
    });
    const holdings = await prisma.holdings.findMany({
      where: { 
        uid, 
        portfolio_id: normalizedPortfolioId
       },
    });
    // 交易變動後背景重算配息（不等 Yahoo 回應）
    syncDividendsForUserHoldings(uid, normalizedPortfolioId).catch(err => console.error('配息同步失敗:', err));
    res.status(200).json({
      transactions,
      holdings,
    });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    console.error('Error updating transaction:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete a transaction
router.delete('/', async (req, res) => {
  const { ids, uid, portfolio_id } = req.body; // e.g., { ids: [1, 2, 3] }
  const normalizedPortfolioId = Number(portfolio_id);

  if (!Array.isArray(ids) || ids.length === 0 || !uid || !portfolio_id || !Number.isInteger(normalizedPortfolioId)) {
    return res.status(400).json({ message: 'Invalid or empty ids array' });
  }

  try {
    // Step 1: 先找出將要刪除的交易資料
    const transactionsToDelete = await prisma.transactions.findMany({
      where: {
        id: { in: ids.map(Number) },
        uid,
        portfolio_id: normalizedPortfolioId,
      },
    });

    if (transactionsToDelete.length === 0) {
      return res.status(404).json({ message: 'No transactions found to delete' });
    }

    // 以下在同一個 DB transaction 內，避免交易、持股不一致
    await prisma.$transaction(async (db) => {
      // Step 2: 建立受影響的 holdings 清單
      const affectedHoldingsSet = new Set(
        transactionsToDelete.map(tx => tx.symbol)
      );

      // Step 3: 刪除交易紀錄
      await db.transactions.deleteMany({
        where: {
          id: { in: transactionsToDelete.map(tx => tx.id) },
        },
      });

      // Step 4: 從剩下的交易重新計算每一筆受影響的 holdings
      for (const symbol of affectedHoldingsSet) {
        await recalcHolding(db, uid, normalizedPortfolioId, symbol);
      }
    });

    // Step 5: 回傳最新資料
    const transactions = await prisma.transactions.findMany({
      where: { 
        uid, 
        portfolio_id: normalizedPortfolioId
       },
    });
    const holdings = await prisma.holdings.findMany({
      where: { 
        uid, 
        portfolio_id: normalizedPortfolioId
       },
    });

    // 交易變動後背景重算配息（不等 Yahoo 回應）
    syncDividendsForUserHoldings(uid, normalizedPortfolioId).catch(err => console.error('配息同步失敗:', err));
    res.status(200).json({
      message: 'Transactions deleted successfully',
      transactions,
      holdings,
    });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    console.error('Error deleting transactions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


export default router;

import express from 'express';
const router = express.Router();

import prisma from '../utils/prisma.js';

import { createTransactionCashFlow, reverseCashFlows } from './cashFlows.js';
import { recalcHolding } from '../services/holdingCalc.js';

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
      cash_account_id,
    } = req.body;

    const normalizedPortfolioId = Number(portfolio_id);

    if (!uid || !symbol || !shares || !price || !transaction_type || !portfolio_id || !Number.isInteger(normalizedPortfolioId)) {
      return res.status(400).json({ message: 'Missing required fields' });
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

    // 如果有指定現金帳戶，使用關聯連接
    if (cash_account_id) {
      transactionData.cash_accounts = { connect: { id: Number(cash_account_id) } };
    }

    // 持股、交易紀錄、現金流在同一個 DB transaction 內，任一步失敗全部回滾
    await prisma.$transaction(async (db) => {
      const newTransaction = await db.transactions.create({
        data: transactionData,
      });
      await recalcHolding(db, uid, normalizedPortfolioId, symbol);

      // 如果有指定現金帳戶，自動建立現金流記錄
      if (cash_account_id) {
        await createTransactionCashFlow(newTransaction, transaction_type, cash_account_id, db);
      }
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

        if (!symbol || !shares || !price || !transaction_type) {
          console.log('Skipping transaction due to missing fields:', tx);
          continue; // Skip this transaction if required fields are missing
        }

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
    if (!uid || !symbol || !portfolio_id || !Number.isInteger(normalizedPortfolioId)) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // 找到舊的交易紀錄
    const oldTransaction = await prisma.transactions.findFirst({
      where: { id: Number(id), uid },
    });
    if (!oldTransaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    await prisma.$transaction(async (db) => {
      const updatedTransaction = await db.transactions.update({
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

      // 現金流跟著交易重算：扣回舊的，再依新的股數/價格/手續費重建
      await reverseCashFlows(db, { uid, related_transaction_id: updatedTransaction.id });
      if (updatedTransaction.cash_account_id) {
        await createTransactionCashFlow(updatedTransaction, transaction_type, updatedTransaction.cash_account_id, db);
      }
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

    // Step 2~5 在同一個 DB transaction 內，避免現金帳戶、交易、持股不一致
    await prisma.$transaction(async (db) => {
      // Step 2: 刪除相關的現金流記錄並更新帳戶餘額
      await reverseCashFlows(db, { uid, related_transaction_id: { in: transactionsToDelete.map(tx => tx.id) } });

      // Step 3: 建立受影響的 holdings 清單
      const affectedHoldingsSet = new Set(
        transactionsToDelete.map(tx => tx.symbol)
      );

      // Step 4: 刪除交易紀錄
      await db.transactions.deleteMany({
        where: {
          id: { in: transactionsToDelete.map(tx => tx.id) },
        },
      });

      // Step 5: 從剩下的交易重新計算每一筆受影響的 holdings
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

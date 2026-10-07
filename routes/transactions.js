import express from 'express';
const router = express.Router();

import prisma from '../utils/prisma.js';

import { createTransactionCashFlow, reverseCashFlows } from './cashFlows.js';

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
      const result = await updateHoldings(db, uid, normalizedPortfolioId, symbol, name, asset_type, shares, price, currency, transaction_type);
      if (result.message !== 'Holdings updated successfully') throw badRequest(result.message);

      const newTransaction = await db.transactions.create({
        data: transactionData,
      });

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
    // ponytail: 逐筆循序查詢，timeout 設 60s；若匯入量大到超時，改成先在記憶體算好 holdings 再 createMany
    await prisma.$transaction(async (db) => {
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

        // 更新 holdings 資料表
        const result = await updateHoldings(db, uid, normalizedPortfolioId, symbol, name, asset_type, shares, price, currency, transaction_type);
        if (result.message !== 'Holdings updated successfully') {
          console.log('Error updating holdings for symbol', symbol, ':', result.message);
          throw badRequest(result.message);
        }

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
    name,
    asset_type,
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
    const oldShares = Number(oldTransaction.shares);
    const newShares = Number(shares) || 0;
    let updatedShares = newShares;

    // if (newShares === oldShares && transaction_type === oldTransaction.transaction_type && ) {
    //   // 如果 shares 和 transaction_type 都沒有變化，則不需要更新
    //   return res.status(201).json({ message: 'No changes detected, transaction not updated' });
    // }

    let newTransactionType = transaction_type;
    
    // 處理 賣出 shares
    if (transaction_type === 'sell' && oldShares > newShares) {
      newTransactionType = 'buy'; // 如果是賣出，且新股數小於舊股數，則視為買入
      updatedShares = oldShares - newShares;
    } else if (transaction_type === 'sell' && oldShares < newShares) {
      updatedShares = newShares - oldShares;
    }

    // 處理 買入 shares
    if (transaction_type === 'buy' && newShares > oldShares) {
      updatedShares = newShares - oldShares;
    } else if (transaction_type === 'buy' && newShares < oldShares) {
      newTransactionType = 'sell'; // 如果是買入，且新股數小於舊股數，則視為賣出
      updatedShares = oldShares - newShares;
    } 

    await prisma.$transaction(async (db) => {
      // 更新 holdings 資料表
      const result = await updateHoldings(db, uid, normalizedPortfolioId, symbol, name, asset_type, updatedShares, price, currency, newTransactionType);
      if (result.message !== 'Holdings updated successfully') throw badRequest(result.message);

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
          id: { in: ids.map(Number) },
          uid,
        },
      });

       // Step 5: 重新計算每一筆受影響的 holdings
      for (const symbol of affectedHoldingsSet) {

        // 找出剩下的該股票所有交易
        const remainingTxs = await db.transactions.findMany({
          where: {
            uid,
            portfolio_id: normalizedPortfolioId,
            symbol,
          },
        });

        // 累加剩下交易的 shares 和成本
        let totalShares = 0;
        let totalCost = 0;

        for (const tx of remainingTxs) {
          const s = Number(tx.shares);
          const p = Number(tx.price);
          const f = Number(tx.fee ?? 0);

          if (tx.transaction_type === 'buy') {
            totalShares += s;
            totalCost += s * p + f;
          } else if (tx.transaction_type === 'sell') {
            totalShares -= s;
          }
        }

        if (totalShares <= 0) {
          // 無剩餘 shares，刪除 holdings
          await db.holdings.delete({
            where: {
              uid_symbol_portfolio: { uid, symbol, portfolio_id: normalizedPortfolioId },
            },
          });
        } else {
          const avgCost = Number((totalCost / totalShares).toFixed(3));
          const holdingCurrency = remainingTxs.find((tx) => tx.transaction_type === 'buy')?.currency || remainingTxs[0]?.currency || 'USD';

          await db.holdings.update({
            where: {
              uid_symbol_portfolio: { uid, symbol, portfolio_id: normalizedPortfolioId },
            },
            data: {
              total_shares: totalShares,
              avg_cost: avgCost,
              currency: holdingCurrency,
              last_updated: new Date(),
            },
          });
        }
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
    console.error('Error deleting transactions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


const updateHoldings = async (db, uid, portfolioId, symbol, name, assetType, shares, price, currency, transactionType) => {
  const normalizedPortfolioId = Number(portfolioId);
  if (!Number.isInteger(normalizedPortfolioId)) {
    return { message: 'Invalid portfolio id' };
  }

  const existing = await db.holdings.findFirst({
    where: {
      uid,
      portfolio_id: normalizedPortfolioId,
      symbol,
    },
  });

  if (!existing && transactionType === 'sell') return { message: `No existing holdings found for symbol ${symbol}` };

  if (transactionType === 'sell') { 
    const leaveShares = Number(existing.total_shares) - Number(shares);
    if (leaveShares <= 0) {
      // 如果賣出後沒有剩餘股數，則刪除 holdings
      await db.holdings.delete({
        where: {
          uid_symbol_portfolio: {
            uid,
            portfolio_id: normalizedPortfolioId,
            symbol,
          },
        },
      });
      console.log('Holdings deleted for symbol:', symbol);
    } else {
      // 如果賣出後還有剩餘股數，則更新 holdings
      await db.holdings.update({
        where: {
          uid_symbol_portfolio: {
            uid,
            portfolio_id: normalizedPortfolioId,
            symbol,
          },
        },
        data: {
          total_shares: leaveShares,
          currency: existing.currency || currency || 'USD',
          avg_cost: existing.avg_cost,  // 賣出時不改變平均成本
          last_updated: new Date(),
        },
      });
    }
  } else {
    // 如果是 購買 操作
    if (existing && existing.total_shares > 0) {
      // 如果已有 holdings，則更新
      const totalOldCost = Number(existing.avg_cost) * Number(existing.total_shares);
      const totalNewCost = Number(price) * Number(shares);
      const totalShares = Number(existing.total_shares) + Number(shares);
  
      const avgCost = totalShares > 0 ? Number(((totalOldCost + totalNewCost) / totalShares).toFixed(3)) : 0;
  
      await db.holdings.update({
        where: {
          uid_symbol_portfolio: {
            uid,
            portfolio_id: portfolioId,
            symbol,
          },
        },
        data: {
          total_shares: totalShares,
          avg_cost: avgCost,
          currency: currency || existing.currency || 'USD',
          last_updated: new Date(),
        },
      });
    } else {
      // 如果沒有 existing holdings，則新增一筆
      await db.holdings.create({
        data: {
          users: { connect: { uid } }, // 關聯到 users.uid
          portfolios: { connect: { id: normalizedPortfolioId } }, // 關聯到 portfolios.id
          symbol,
          name,
          asset_type: assetType,
          total_shares: shares,
          avg_cost: price,  // 初始平均成本為購買價格
          currency: currency || 'USD',
          last_updated: new Date(),
        },
      });
      console.log('New holdings created for symbol:', symbol);
    }
  }

  return {
    message: 'Holdings updated successfully',
  };
};


const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

export default router;

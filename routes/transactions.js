import express from 'express';
const router = express.Router();

import { PrismaClient } from '../generated/prisma/index.js';
const prisma = new PrismaClient();

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
      fee,
      transaction_type,
      transaction_date,
    } = req.body;

    if (!uid || !symbol || !shares || !price || !transaction_type || !portfolio_id) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // 以下更新 holdings 資料表
    const result = await updateHoldings(uid, portfolio_id, symbol, name, asset_type, shares, price, transaction_type);
    if (result.message !== 'Holdings updated successfully') {
      console.log('Error updating holdings:', result.message);
      return res.status(400).json({ message: result.message });
    }

    // 新增交易紀錄
    await prisma.transactions.create({
      data: {
        users: {connect: { uid } }, // 連接到使用者,
        portfolios: { connect: { id: Number(portfolio_id) } },
        symbol,
        name,
        asset_type,
        shares,
        price,
        fee,
        transaction_type,
        transaction_date: transaction_date ? new Date(transaction_date) : undefined,
      },
    });

    // 回傳新的所有交易紀錄
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
    res.status(201).json({
      message: 'Transaction created successfully',
      transactions,
      holdings,
    });

  } catch (error) {
    console.error('Error creating transaction:', error);
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
    transaction_type,
    transaction_date,
  } = req.body;

  try {
    // 找到舊的交易紀錄
    const oldTransaction = await prisma.transactions.findFirst({
      where: { id: Number(id) },
    });
    const oldShares = oldTransaction ? Number(oldTransaction.shares) : 0;
    const newShares = Number(shares) || 0;
    let updatedShares = newShares;

    if (newShares === oldShares && transaction_type === oldTransaction.transaction_type) {
      // 如果 shares 和 transaction_type 都沒有變化，則不需要更新
      return res.status(201).json({ message: 'No changes detected, transaction not updated' });
    }

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

    // 更新 holdings 資料表
    const result = await updateHoldings(uid, portfolio_id, symbol, name, asset_type, updatedShares, price, newTransactionType);
    if (result.message !== 'Holdings updated successfully') {
      console.log('Error updating holdings:', result.message);
      return res.status(400).json({ message: result.message });
    }

    await prisma.transactions.update({
      where: { id: Number(id) },
      data: {
        shares,
        price,
        fee: fee || 0,
        transaction_type,
        transaction_date: transaction_date ? new Date(transaction_date) : undefined,
      },
    });
    
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
    res.status(200).json({
      transactions,
      holdings,
    });
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete a transaction
router.delete('/', async (req, res) => {
  const { ids, uid, portfolio_id } = req.body; // e.g., { ids: [1, 2, 3] }

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty ids array' });
  }

  try {
    // Step 1: 先找出將要刪除的交易資料
    const transactionsToDelete = await prisma.transactions.findMany({
      where: {
        id: { in: ids.map(Number) },
      },
    });

    if (transactionsToDelete.length === 0) {
      return res.status(404).json({ message: 'No transactions found to delete' });
    }

    // Step 2: 建立受影響的 holdings 清單
    const affectedHoldingsSet = new Set(
      transactionsToDelete.map(tx => tx.symbol)
    );

    // Step 3: 刪除交易紀錄
    await prisma.transactions.deleteMany({
      where: {
        id: { in: ids.map(Number) },
      },
    });

     // Step 4: 重新計算每一筆受影響的 holdings
    for (const symbol of affectedHoldingsSet) {

      // 找出剩下的該股票所有交易
      const remainingTxs = await prisma.transactions.findMany({
        where: {
          uid,
          portfolio_id,
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
        await prisma.holdings.delete({
          where: {
            uid_symbol_portfolio: { uid, symbol, portfolio_id },
          },
        });
      } else {
        const avgCost = Number((totalCost / totalShares).toFixed(2));

        await prisma.holdings.update({
          where: {
            uid_symbol_portfolio: { uid, symbol, portfolio_id },
          },
          data: {
            total_shares: totalShares,
            avg_cost: avgCost,
            last_updated: new Date(),
          },
        });
      }
    }



    // Step 5: 回傳最新資料
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


const updateHoldings = async (uid, portfolioId, symbol, name, assetType, shares, price, transactionType) => {
  const existing = await prisma.holdings.findFirst({
    where: {
      uid,
      portfolio_id: portfolioId,
      symbol,
    },
  });

  if (!existing && transactionType === 'sell') return { message: 'No existing holdings found' };

  if (transactionType === 'sell') { 
    const leaveShares = Number(existing.total_shares) - Number(shares);
    if (leaveShares <= 0) {
      // 如果賣出後沒有剩餘股數，則刪除 holdings
      await prisma.holdings.delete({
        where: {
          uid_symbol_portfolio: {
            uid,
            portfolio_id: portfolioId,
            symbol,
          },
        },
      });
      console.log('Holdings deleted for symbol:', symbol);
    } else {
      // 如果賣出後還有剩餘股數，則更新 holdings
      await prisma.holdings.update({
        where: {
          uid_symbol_portfolio: {
            uid,
            portfolio_id: portfolioId,
            symbol,
          },
        },
        data: {
          total_shares: leaveShares,
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
  
      const avgCost = totalShares > 0 ? Number(((totalOldCost + totalNewCost) / totalShares).toFixed(2)) : 0;
  
      await prisma.holdings.update({
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
          last_updated: new Date(),
        },
      });
    } else {
      // 如果沒有 existing holdings，則新增一筆
      await prisma.holdings.create({
        data: {
          users: { connect: { uid } }, // 關聯到 users.uid
          portfolios: { connect: { id: Number(portfolioId) } }, // 關聯到 portfolios.id
          symbol,
          name,
          asset_type: assetType,
          total_shares: shares,
          avg_cost: price,  // 初始平均成本為購買價格
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


export default router;

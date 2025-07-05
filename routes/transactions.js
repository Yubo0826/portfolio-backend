import express from 'express';
const router = express.Router();

import { PrismaClient } from '../generated/prisma/index.js';
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const { uid } = req.query;
    const transactions = await prisma.transactions.findMany({
      where: { uid },
    });
    res.json(transactions);
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
      symbol,
      name,
      assetType,
      shares,
      price,
      fee,
      transactionType,
      transactionDate,
    } = req.body;

    if (!uid || !symbol || !shares || !price || !transactionType) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // 以下更新 holdings 資料表 
    const existing = await prisma.holdings.findFirst({
      where: {
        uid,
        symbol,
      },
    });

    console.log('Existing holdings:', existing);

    if (!existing && transactionType === 'sell') {
      // 如果 holdings 中不存在該股票，且是賣出操作，則回傳錯誤
      return res.status(400).json({
        message: 'Cannot sell shares that are not held',
      });
    }

    if (!existing) {
      // 如果 holdings 中不存在該股票，則新增
      await prisma.holdings.create({
        data: {
          users: {connect: { uid } }, // 連接到使用者
          symbol,
          name,
          asset_type: assetType,
          total_shares: shares,
          avg_cost: price, // 初始平均成本為當前價格
          last_updated: new Date(),
        },
      });
    } else {
      // 如果 holdings 中已存在該股票，則更新
      // 如果是 賣出 操作
      if (transactionType === 'sell') {
        const leaveShares = Number(existing.total_shares) - Number(shares);
        if (leaveShares < 0) {
          // 如果賣出股數大於持有股數，則回傳錯誤
          return res.status(400).json({
            message: 'Not enough shares to sell',
            existing_shares: existing.total_shares,
          });
        } else if (leaveShares === 0) {
          // 如果賣出後剩餘 0 股，則刪除 holdings
          await prisma.holdings.delete({
            where: {
              uid_symbol: {
                uid,
                symbol,
              }
            },
          });
          console.log('Holdings deleted for symbol:', symbol);
          // return res.status(200).json({ message: 'Holdings deleted' });
        } else {
          // 如果賣出後還有剩餘股數，則更新 holdings
          await prisma.holdings.update({
            where: {
              uid_symbol: {
                uid,
                symbol,
              }
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
        const totalOldCost = Number(existing.avg_cost) * Number(existing.total_shares);
        const totalNewCost = Number(price) * Number(shares) + Number(fee);
        const totalShares = Number(existing.total_shares) + Number(shares);

        const avgCost = totalShares > 0 ? Number(((totalOldCost + totalNewCost) / totalShares).toFixed(2)) : 0;

        console.log('totalOldCost', totalOldCost);
        console.log('totalNewCost', totalNewCost);
        console.log('totalShares', totalShares);
        console.log('avgCost', avgCost);
        const updateHolding = await prisma.holdings.update({
          where: {
            uid_symbol: {
              uid,
              symbol,
            }
          },
          data: {
            total_shares: totalShares,
            avg_cost: avgCost,
            last_updated: new Date(),
          },
        });

        console.log('Updated holdings:', updateHolding);
      }
    }

    // 新增交易紀錄
    await prisma.transactions.create({
      data: {
        users: {connect: { uid } }, // 連接到使用者,
        symbol,
        name,
        asset_type: assetType,
        shares,
        price,
        fee,
        transaction_type: transactionType,
        transaction_date: transactionDate ? new Date(transactionDate) : undefined,
      },
    });

    // 回傳新的所有交易紀錄
    const transactions = await prisma.transactions.findMany({
      where: { uid },
    });
    res.status(201).json(transactions);

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
    symbol,
    name,
    assetType,
    shares,
    fee,
    price,
    transactionType,
    transactionDate,
  } = req.body;

  try {
    const updatedTransaction = await prisma.transactions.update({
      where: { id: Number(id) },
      data: {
        uid,
        symbol,
        name,
        asset_type: assetType,
        shares,
        price,
        fee: fee || 0,
        transaction_type: transactionType,
        transaction_date: transactionDate ? new Date(transactionDate) : undefined,
      },
    });
    res.json(updatedTransaction);
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete a transaction
router.delete('/', async (req, res) => {
  const { ids } = req.body; // e.g., { ids: [1, 2, 3] }

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty ids array' });
  }

  try {
    await prisma.transactions.deleteMany({
      where: {
        id: { in: ids.map(Number) },
      },
    });
    res.status(204).send('deleted');
  } catch (error) {
    console.error('Error deleting transactions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


export default router;

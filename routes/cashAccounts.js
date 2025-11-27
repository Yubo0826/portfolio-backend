import express from 'express';
const router = express.Router();

import { PrismaClient } from '../generated/prisma/index.js';
const prisma = new PrismaClient();

// 取得所有現金帳戶
router.get('/', async (req, res) => {
  try {
    const { uid } = req.query;
    if (!uid) {
      return res.status(400).json({ message: 'Missing required field: uid' });
    }

    const accounts = await prisma.cash_accounts.findMany({
      where: { uid },
      orderBy: { created_at: 'desc' },
    });

    // 計算總餘額
    const totalBalance = accounts.reduce((sum, account) => {
      return sum + Number(account.balance);
    }, 0);

    res.json({
      accounts,
      totalBalance,
    });
  } catch (error) {
    console.error('Error fetching cash accounts:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 新增現金帳戶
router.post('/', async (req, res) => {
  try {
    const { uid, name, balance, currency, description } = req.body;

    if (!uid || !name) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const newAccount = await prisma.cash_accounts.create({
      data: {
        uid,
        name,
        balance: balance || 0,
        currency: currency || 'USD',
        description,
      },
    });

    res.status(201).json({
      message: 'Cash account created successfully',
      account: newAccount,
    });
  } catch (error) {
    console.error('Error creating cash account:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 更新現金帳戶
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { uid, name, balance, currency, description } = req.body;

    if (!uid) {
      return res.status(400).json({ message: 'Missing required field: uid' });
    }

    // 驗證帳戶所有權
    const account = await prisma.cash_accounts.findFirst({
      where: {
        id: Number(id),
        uid,
      },
    });

    if (!account) {
      return res.status(404).json({ message: 'Cash account not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (balance !== undefined) updateData.balance = balance;
    if (currency !== undefined) updateData.currency = currency;
    if (description !== undefined) updateData.description = description;

    const updatedAccount = await prisma.cash_accounts.update({
      where: { id: Number(id) },
      data: updateData,
    });

    res.json({
      message: 'Cash account updated successfully',
      account: updatedAccount,
    });
  } catch (error) {
    console.error('Error updating cash account:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 刪除現金帳戶
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { uid } = req.query;

    if (!uid) {
      return res.status(400).json({ message: 'Missing required field: uid' });
    }

    // 驗證帳戶所有權
    const account = await prisma.cash_accounts.findFirst({
      where: {
        id: Number(id),
        uid,
      },
    });

    if (!account) {
      return res.status(404).json({ message: 'Cash account not found' });
    }

    // 檢查是否有關聯的現金流記錄
    const relatedFlows = await prisma.cash_flows.count({
      where: { account_id: Number(id) },
    });

    if (relatedFlows > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete account with existing cash flow records',
        relatedFlows,
      });
    }

    await prisma.cash_accounts.delete({
      where: { id: Number(id) },
    });

    res.json({ message: 'Cash account deleted successfully' });
  } catch (error) {
    console.error('Error deleting cash account:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 取得單一帳戶詳情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { uid } = req.query;

    if (!uid) {
      return res.status(400).json({ message: 'Missing required field: uid' });
    }

    const account = await prisma.cash_accounts.findFirst({
      where: {
        id: Number(id),
        uid,
      },
      include: {
        cash_flows: {
          orderBy: { date: 'desc' },
          take: 10, // 最近10筆記錄
        },
      },
    });

    if (!account) {
      return res.status(404).json({ message: 'Cash account not found' });
    }

    res.json(account);
  } catch (error) {
    console.error('Error fetching cash account:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;

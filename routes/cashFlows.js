import express from 'express';
const router = express.Router();

import { PrismaClient } from '../generated/prisma/index.js';
const prisma = new PrismaClient();

// 取得現金流記錄（支援分頁和篩選）
router.get('/', async (req, res) => {
  try {
    const { 
      uid, 
      portfolio_id, 
      account_id, 
      flow_type,
      start_date,
      end_date,
      page = 1, 
      limit = 50 
    } = req.query;

    if (!uid) {
      return res.status(400).json({ message: 'Missing required field: uid' });
    }

    const where = { uid };
    
    if (portfolio_id) where.portfolio_id = Number(portfolio_id);
    if (account_id) where.account_id = Number(account_id);
    if (flow_type) where.flow_type = flow_type;
    
    // 日期範圍篩選
    if (start_date || end_date) {
      where.date = {};
      if (start_date) where.date.gte = new Date(start_date);
      if (end_date) where.date.lte = new Date(end_date);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [cashFlows, total] = await Promise.all([
      prisma.cash_flows.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take,
        include: {
          cash_accounts: {
            select: {
              id: true,
              name: true,
              currency: true,
            },
          },
          portfolios: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.cash_flows.count({ where }),
    ]);

    res.json({
      cashFlows,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching cash flows:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 手動新增現金流記錄
router.post('/', async (req, res) => {
  try {
    const {
      uid,
      account_id,
      portfolio_id,
      amount,
      flow_type,
      description,
      date,
    } = req.body;

    if (!uid || !account_id || !amount || !flow_type || !date) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // 驗證帳戶所有權
    const account = await prisma.cash_accounts.findFirst({
      where: {
        id: Number(account_id),
        uid,
      },
    });

    if (!account) {
      return res.status(404).json({ message: 'Cash account not found' });
    }

    // 驗證投資組合所有權（如果提供）
    if (portfolio_id) {
      const portfolio = await prisma.portfolios.findFirst({
        where: {
          id: Number(portfolio_id),
          uid,
        },
      });

      if (!portfolio) {
        return res.status(404).json({ message: 'Portfolio not found' });
      }
    }

    // 新增現金流記錄
    const newCashFlow = await prisma.cash_flows.create({
      data: {
        uid,
        account_id: Number(account_id),
        portfolio_id: portfolio_id ? Number(portfolio_id) : null,
        amount: Number(amount),
        flow_type,
        description,
        date: new Date(date),
      },
      include: {
        cash_accounts: {
          select: {
            id: true,
            name: true,
            currency: true,
          },
        },
      },
    });

    // 更新帳戶餘額
    const newBalance = Number(account.balance) + Number(amount);
    await prisma.cash_accounts.update({
      where: { id: Number(account_id) },
      data: { balance: newBalance },
    });

    res.status(201).json({
      message: 'Cash flow created successfully',
      cashFlow: newCashFlow,
      newBalance,
    });
  } catch (error) {
    console.error('Error creating cash flow:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 刪除現金流記錄
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { uid } = req.query;

    if (!uid) {
      return res.status(400).json({ message: 'Missing required field: uid' });
    }

    // 驗證記錄所有權
    const cashFlow = await prisma.cash_flows.findFirst({
      where: {
        id: Number(id),
        uid,
      },
      include: {
        cash_accounts: true,
      },
    });

    if (!cashFlow) {
      return res.status(404).json({ message: 'Cash flow not found' });
    }

    // 如果是自動生成的記錄（有關聯交易或股利），不允許刪除
    if (cashFlow.related_transaction_id || cashFlow.related_dividend_id) {
      return res.status(400).json({ 
        message: 'Cannot delete auto-generated cash flow records. Delete the related transaction or dividend instead.',
      });
    }

    // 更新帳戶餘額（扣回金額）
    const newBalance = Number(cashFlow.cash_accounts.balance) - Number(cashFlow.amount);
    await prisma.cash_accounts.update({
      where: { id: cashFlow.account_id },
      data: { balance: newBalance },
    });

    // 刪除記錄
    await prisma.cash_flows.delete({
      where: { id: Number(id) },
    });

    res.json({ 
      message: 'Cash flow deleted successfully',
      newBalance,
    });
  } catch (error) {
    console.error('Error deleting cash flow:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 取得現金流統計
router.get('/stats', async (req, res) => {
  try {
    const { uid, portfolio_id, account_id, start_date, end_date } = req.query;

    if (!uid) {
      return res.status(400).json({ message: 'Missing required field: uid' });
    }

    const where = { uid };
    
    if (portfolio_id) where.portfolio_id = Number(portfolio_id);
    if (account_id) where.account_id = Number(account_id);
    
    // 日期範圍篩選
    if (start_date || end_date) {
      where.date = {};
      if (start_date) where.date.gte = new Date(start_date);
      if (end_date) where.date.lte = new Date(end_date);
    }

    const cashFlows = await prisma.cash_flows.findMany({
      where,
      select: {
        amount: true,
        flow_type: true,
      },
    });

    // 按類型統計
    const stats = {
      total_inflow: 0,
      total_outflow: 0,
      net_flow: 0,
      by_type: {},
    };

    cashFlows.forEach(flow => {
      const amount = Number(flow.amount);
      
      if (amount > 0) {
        stats.total_inflow += amount;
      } else {
        stats.total_outflow += Math.abs(amount);
      }

      if (!stats.by_type[flow.flow_type]) {
        stats.by_type[flow.flow_type] = {
          count: 0,
          total: 0,
        };
      }
      stats.by_type[flow.flow_type].count += 1;
      stats.by_type[flow.flow_type].total += amount;
    });

    stats.net_flow = stats.total_inflow - stats.total_outflow;

    res.json(stats);
  } catch (error) {
    console.error('Error fetching cash flow stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Helper function: 自動建立交易相關的現金流
export async function createTransactionCashFlow(transaction, transactionType, cashAccountId) {
  try {
    if (!cashAccountId) {
      return; // 沒有指定現金帳戶，不建立現金流
    }

    const accountId = Number(cashAccountId);
    const amount = Number(transaction.shares) * Number(transaction.price) + (Number(transaction.fee) || 0);
    const flowAmount = transactionType === 'buy' ? -amount : amount; // 買入為負，賣出為正

    const cashFlow = await prisma.cash_flows.create({
      data: {
        uid: transaction.uid,
        account_id: accountId,
        portfolio_id: transaction.portfolio_id,
        related_transaction_id: transaction.id,
        related_symbol: transaction.symbol,
        amount: flowAmount,
        flow_type: transactionType === 'buy' ? 'stock_buy' : 'stock_sell',
        // description: `${transactionType === 'buy' ? '買入' : '賣出'} ${transaction.symbol} ${transaction.shares} 股`,
        date: transaction.transaction_date || new Date(),
      },
    });

    // 更新帳戶餘額
    const account = await prisma.cash_accounts.findUnique({
      where: { id: accountId },
    });

    if (account) {
      await prisma.cash_accounts.update({
        where: { id: accountId },
        data: { balance: Number(account.balance) + flowAmount },
      });
    }

    return cashFlow;
  } catch (error) {
    console.error('Error creating transaction cash flow:', error);
    throw error;
  }
}

// Helper function: 自動建立股利相關的現金流
export async function createDividendCashFlows(uid, portfolioId, cashAccountId = null) {
  try {
    // 如果沒有指定現金帳戶，使用用戶的第一個帳戶
    let accountId = cashAccountId;
    if (!accountId) {
      const defaultAccount = await prisma.cash_accounts.findFirst({
        where: { uid },
        orderBy: { created_at: 'asc' },
      });
      
      if (!defaultAccount) {
        console.log('No cash account found for user');
        return;
      }
      accountId = defaultAccount.id;
    }

    // 取得最後更新現金流的時間
    const lastCashFlow = await prisma.cash_flows.findFirst({
      where: {
        uid,
        portfolio_id: portfolioId,
        flow_type: 'dividend',
      },
      orderBy: { created_at: 'desc' },
    });

    const afterDate = lastCashFlow ? lastCashFlow.created_at : new Date(0);

    // 取得新的股利記錄
    const newDividends = await prisma.dividends.findMany({
      where: {
        uid,
        portfolio_id: portfolioId,
        created_at: { gt: afterDate },
      },
    });

    console.log(`Found ${newDividends.length} new dividends to process`);

    const createdFlows = [];
    for (const dividend of newDividends) {
      const totalDividend = Number(dividend.amount) * Number(dividend.shares);
      
      const cashFlow = await prisma.cash_flows.create({
        data: {
          uid,
          account_id: accountId,
          portfolio_id: portfolioId,
          related_dividend_id: dividend.id,
          related_symbol: dividend.symbol,
          amount: totalDividend,
          flow_type: 'dividend',
          description: `${dividend.symbol} 股利收入 (${dividend.shares} 股 × $${dividend.amount})`,
          date: dividend.date,
        },
      });

      // 更新帳戶餘額
      await prisma.cash_accounts.update({
        where: { id: accountId },
        data: {
          balance: {
            increment: totalDividend,
          },
        },
      });

      createdFlows.push(cashFlow);
    }

    return createdFlows;
  } catch (error) {
    console.error('Error creating dividend cash flows:', error);
    throw error;
  }
}

export default router;

import express from 'express';
const router = express.Router();

import { PrismaClient } from '../generated/prisma/index.js';
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const { uid } = req.query;
    const portfolios = await prisma.portfolios.findMany({
      where: { uid },
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
   } = req.body;

  if (!uid || !name) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const newPortfolio = await prisma.portfolios.create({
      data: {
        uid,
        name,
        description,
      },
    });
    
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
    name,
    description,
   } = req.body;

  if (!id || !name) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const updatedPortfolio = await prisma.portfolios.update({
      where: { id: Number(id) },
      data: {
        name,
        description,
      },
    });
    
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
    // 刪除 portfolios
    const deletedPortfolios = await prisma.portfolios.deleteMany({
      where: {
        id: { in: ids.map(Number) },
        uid,
      },
    });

    if (deletedPortfolios.count === 0) {
      return res.status(404).json({ message: 'Portfolios not found' });
    }

    // 刪除連動的 holdings 和 transactions
    await prisma.holdings.deleteMany({
      where: {
        uid
      },
    });

    await prisma.transactions.deleteMany({
      where: {
        uid
      },
    });

    res.json({ message: 'Portfolios deleted successfully' });
  } catch (error) {
    console.error('Error deleting portfolios:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
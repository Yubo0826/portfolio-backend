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
    await prisma.portfolios.create({
      data: {
        uid,
        name,
        description,
      },
    });
    
    res.status(200).json({
      message: 'Portfolio created successfully'
    });
  } catch (error) {
    console.error('Error creating portfolio:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
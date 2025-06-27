import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

router.get('/:symbol', async (req, res) => {
  const symbol = req.params.symbol;
  const { date } = req.query;
  const apiKey = process.env.TIINGO_API_KEY;

  const url = `https://api.tiingo.com/tiingo/daily/${symbol}/prices?startDate=${date}&endDate=${date}&token=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Tiingo fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch data from Tiingo' });
  }
});

export default router;

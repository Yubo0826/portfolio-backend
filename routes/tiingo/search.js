import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const apiKey = process.env.TIINGO_API_KEY;

// Search for symbol name
router.get('/symbols', async (req, res) => {
    const query = req.query.query;
    const url = `https://api.tiingo.com/tiingo/utilities/search?query=${query}&token=${apiKey}`;
    console.log('Received /api/search/symbols request:', url);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const data = await response.json();
      console.log('Tiingo symbols search response:', data);
      res.json(data);
    } catch (error) {
      console.error('Tiingo fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch data from Tiingo' });
    }
})

// Search for symbol price
router.get('/price/:symbol', async (req, res) => {
  console.log('Received /api/search/price request:', req.params);
  const symbol = req.params.symbol;
  const { startDate, endDate } = req.query;
  const url = `https://api.tiingo.com/tiingo/daily/${symbol}/prices?startDate=${startDate}&endDate=${endDate}&token=${apiKey}`;
  console.log('Tiingo price URL:', url);

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    const data = await response.json();
    console.log('Tiingo price response:', data);
    res.json(data);
  } catch (error) {
    console.error('Tiingo fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch data from Tiingo' });
  }
});

export default router;
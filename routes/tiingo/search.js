import express from 'express';
import fetch from 'node-fetch';
import yahooFinance from 'yahoo-finance2';

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
// router.get('/price/:symbol', async (req, res) => {
//   console.log('Received /api/search/price request:', req.params);
//   const symbol = req.params.symbol;
//   const { startDate, endDate } = req.query;
//   let url
//   if (!startDate && !endDate) {
//     url = `https://api.tiingo.com/tiingo/daily/${symbol}/prices?token=${apiKey}`;  // 拿到最近的價格
//   } else {
//     url = `https://api.tiingo.com/tiingo/daily/${symbol}/prices?startDate=${startDate}&endDate=${endDate}&token=${apiKey}`;
//   }
//   console.log('Tiingo price URL:', url);

//   try {
//     const response = await fetch(url);
//     if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
//     const data = await response.json();
//     console.log('Tiingo price response:', data);
//     res.json(data);
//   } catch (error) {
//     console.error('Tiingo fetch error:', error);
//     res.status(500).json({ error: 'Failed to fetch data from Tiingo' });
//   }
// });


router.get('/price/:symbol', async (req, res) => {
  console.log('Received /api/search/price request:', req.params);
  const symbol = req.params.symbol;
  const { startDate, endDate } = req.query;

  try {
    let data;
    if (!startDate && !endDate) {
      // 即時報價
      data = await yahooFinance.quote(symbol);
      console.log('Yahoo quote response:', data);
      // res.json({
      //   symbol: data.symbol,
      //   name: data.longName,
      //   price: data.regularMarketPrice,
      //   previousClose: data.regularMarketPreviousClose,
      //   currency: data.currency,
      //   marketCap: data.marketCap,
      // });
      res.status(200).json(data);
    } else {
      // 歷史股價資料
      const options = {
        period1: '2024-01-01',
        period2: endDate,
        interval: '1d', // daily data
      };
      data = await yahooFinance.chart(symbol, options);
      console.log('Yahoo historical response:', data);
      res.json(data);
    }
  } catch (error) {
    console.error('Yahoo Finance fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch data from Yahoo Finance' });
  }
});



export default router;
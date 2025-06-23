// server.js
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors()); // 允許所有來源 CORS

app.get('/api/tiingo/:symbol', async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`🚀 Tiingo Proxy Server running at http://localhost:${PORT}`);
});

// 歷史匯率抓取：交易成立時記下當天的匯率，成本才不會隨今日匯率浮動
//
// fx.js 刻意維持純函式（好做單元測試），需要打 Yahoo 的部分放這裡。

import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

import { fxSymbolOf, rateOnOrBefore } from './fx.js';

const DAY = 86400000;

const toDateKey = (date) => new Date(date).toISOString().slice(0, 10);

/**
 * 依一批交易需要的（幣別, 日期）抓歷史匯率，回傳查詢函式。
 *
 * 每個幣別只打一次 Yahoo（抓涵蓋整批日期的區間），所以批次匯入 100 筆
 * 也只有「幣別數」次請求。抓不到的幣別查詢函式回 null，呼叫端存 null 即可。
 *
 * @param entries [{ currency, date }]
 * @returns (currency, date) => number | null  // 1 USD = ? currency
 */
export async function buildFxRateLookup(entries) {
  const ranges = new Map();
  for (const entry of entries) {
    const code = String(entry.currency || 'USD').toUpperCase();
    if (code === 'USD') continue;

    const time = new Date(entry.date || new Date()).getTime();
    if (Number.isNaN(time)) continue;

    const range = ranges.get(code);
    ranges.set(code, range
      ? { min: Math.min(range.min, time), max: Math.max(range.max, time) }
      : { min: time, max: time });
  }

  const ratesByCurrency = new Map();

  await Promise.all([...ranges].map(async ([code, range]) => {
    try {
      const chart = await yahooFinance.chart(fxSymbolOf(code), {
        // 往前多抓 10 天，交易日剛好是匯市假日時也有前一天可用
        period1: new Date(range.min - 10 * DAY),
        period2: new Date(range.max + 2 * DAY),
        interval: '1d',
      });

      const rates = new Map();
      for (const quote of chart?.quotes || []) {
        if (quote.close != null && quote.date) rates.set(toDateKey(quote.date), Number(quote.close));
      }
      if (rates.size > 0) ratesByCurrency.set(code, rates);
    } catch (e) {
      console.warn(`[fxHistory] Failed to fetch ${code} rate history:`, e?.message || e);
    }
  }));

  return (currency, date) => {
    const code = String(currency || 'USD').toUpperCase();
    if (code === 'USD') return 1;

    const rates = ratesByCurrency.get(code);
    if (!rates) return null;

    return rateOnOrBefore(rates, toDateKey(date || new Date()));
  };
}

/** 單筆交易用：包一層 buildFxRateLookup */
export async function fetchFxRate(currency, date) {
  const lookup = await buildFxRateLookup([{ currency, date }]);
  return lookup(currency, date);
}

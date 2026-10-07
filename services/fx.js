// 歷史匯率換算（holdings-chart 用）
// ponytail: 只支援 USD / TWD（與前端 convertAmountFromCurrency 相同）；要加幣別時改成以 USD 為中介、每個幣別抓一條 XXX=X

export const USD_TWD_SYMBOL = 'TWD=X'; // Yahoo：1 USD = ? TWD

export function convert(amount, from, to, usdTwd) {
  if (from === to || !(usdTwd > 0)) return amount;
  if (from === 'USD' && to === 'TWD') return amount * usdTwd;
  if (from === 'TWD' && to === 'USD') return amount / usdTwd;
  return amount;
}

// 給每個日期一個匯率：當天沒報價沿用前一天；最前面沒有報價的日期用第一筆報價補
// rates: Map<'YYYY-MM-DD', number>，dates 需已排序
export function ratesForDates(dates, rates) {
  const first = [...rates.keys()].sort()[0];
  let last = rates.get(first);
  return new Map(dates.map((dk) => {
    if (rates.has(dk)) last = rates.get(dk);
    return [dk, last];
  }));
}

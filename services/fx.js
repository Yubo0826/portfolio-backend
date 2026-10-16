// 多幣別歷史匯率換算（holdings-chart、每日偏差檢查用）
//
// 以 USD 為基準幣：Yahoo 的 `XXX=X` 報價就是「1 USD = ? XXX」，
// 任兩種幣別都經由 USD 中轉，不需要逐一組合匯率對。

/** 有對應 Yahoo `XXX=X` 報價、且與前端 CURRENCY_META 一致的幣別 */
export const SUPPORTED_CURRENCIES = [
  'USD', 'TWD', 'JPY', 'HKD', 'CNY', 'KRW', 'GBP', 'EUR', 'SGD', 'AUD', 'CAD', 'CHF', 'INR',
];

export const USD_TWD_SYMBOL = 'TWD=X'; // Yahoo：1 USD = ? TWD

/** 某幣別對 USD 的 Yahoo 報價代號；USD 本身沒有（也不需要）報價 */
export const fxSymbolOf = (currency) => {
  const code = String(currency || '').trim().toUpperCase();
  return !code || code === 'USD' ? null : `${code}=X`;
};

/**
 * 幣別換算。
 *
 * @param rates 1 USD = rates[code]；為了相容舊呼叫端，傳 number 時視為 USD/TWD 匯率
 * @returns 任一邊匯率缺漏時原樣回傳（不要變成 NaN，寧可少換也不要換錯）
 */
export function convert(amount, from, to, rates) {
  const fromCode = String(from || 'USD').toUpperCase();
  const toCode = String(to || 'USD').toUpperCase();
  if (fromCode === toCode) return amount;

  const table = typeof rates === 'number' ? { TWD: rates } : (rates || {});
  const rateOf = (code) => (code === 'USD' ? 1 : Number(table[code]) || 0);

  const fromRate = rateOf(fromCode);
  const toRate = rateOf(toCode);
  if (!(fromRate > 0) || !(toRate > 0)) return amount;

  return (amount / fromRate) * toRate;
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

/**
 * 取 dateKey 當天的匯率；當天沒報價（假日、休市）就往前找最近一天。
 * 整張表都比 dateKey 晚（例如交易日早於 Yahoo 的資料起點）時退回最早一筆，
 * 回 null 代表這個幣別完全沒有匯率資料。
 */
export function rateOnOrBefore(rates, dateKey) {
  let onOrBefore = null;
  let onOrBeforeKey = null;
  let earliest = null;
  let earliestKey = null;

  for (const [key, rate] of rates) {
    if (!(rate > 0)) continue;
    if (key <= dateKey && (onOrBeforeKey === null || key > onOrBeforeKey)) {
      onOrBeforeKey = key;
      onOrBefore = rate;
    }
    if (earliestKey === null || key < earliestKey) {
      earliestKey = key;
      earliest = rate;
    }
  }

  return onOrBefore ?? earliest ?? null;
}

/**
 * 把「每個幣別一張日期 -> 匯率表」轉成「某一天的 { code: rate }」，直接餵給 convert。
 * @param fxByCurrency Map<code, Map<dateKey, rate>>
 */
export function ratesOnDate(fxByCurrency, dateKey) {
  const table = {};
  for (const [code, byDate] of fxByCurrency) {
    const rate = byDate.get(dateKey);
    if (rate > 0) table[code] = rate;
  }
  return table;
}

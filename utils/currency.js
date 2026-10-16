/**
 * 幣別工具（與前端 src/utils/currency.ts 規則一致）。
 *
 * Yahoo 對部分交易所回的是「輔幣」代碼，數值是主幣的 100 倍：
 *   - GBp（倫敦，便士）、ZAc（約翰尼斯堡，分）、ILA（特拉維夫，agorot）
 * 這類代碼大小寫有意義（GBp !== GBP），比對前不能先 toUpperCase。
 */

const MINOR_UNIT_CURRENCIES = {
  GBp: { currency: 'GBP', multiplier: 0.01 },
  ZAc: { currency: 'ZAR', multiplier: 0.01 },
  ILA: { currency: 'ILS', multiplier: 0.01 },
};

export const normalizeCurrency = (currency) => String(currency || 'USD').trim().toUpperCase();

/**
 * 把 Yahoo 回的幣別代碼與金額一起正規化成主幣。
 * 例：fromQuoteCurrency(605.7, 'GBp') -> { amount: 6.057, currency: 'GBP' }
 */
export const fromQuoteCurrency = (amount, rawCurrency) => {
  const raw = String(rawCurrency ?? '').trim();
  const minor = MINOR_UNIT_CURRENCIES[raw];

  if (!minor) {
    return { amount: amount ?? null, currency: normalizeCurrency(raw) };
  }

  return {
    amount: amount == null || Number.isNaN(Number(amount)) ? null : Number(amount) * minor.multiplier,
    currency: minor.currency,
  };
};

/** 只正規化代碼，不動金額 */
export const normalizeQuoteCurrency = (rawCurrency) => fromQuoteCurrency(null, rawCurrency).currency;

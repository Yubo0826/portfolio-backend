/**
 * 股票代號正規化工具。
 *
 * 台股代號（如 0050、00830、2330）在 Yahoo Finance 必須帶交易所後綴才查得到：
 *   - 上市（TWSE） -> `.TW`
 *   - 上櫃（TPEx） -> `.TWO`
 * 若資料庫存的是裸代號，Yahoo 會回 "No data found, symbol may be delisted"，
 * 導致該檔的市值在圖表中被當成 0。
 */

// 台股代號：4~6 位數字，部分槓桿/反向 ETF 會多一個英文字尾（如 00631L、00632R）
const TW_SYMBOL_PATTERN = /^\d{4,6}[A-Z]?$/;

const TW_SUFFIXES = ['.TW', '.TWO'];

/** 已經帶後綴、指數（^）或匯率（=X）的代號不再處理 */
const hasExplicitSuffix = (symbol) => /[.=^]/.test(symbol);

/**
 * 把使用者輸入 / 資料庫中的代號轉成標準大寫格式。
 * 只做 trim + uppercase，不猜測交易所。
 */
export const normalizeSymbol = (symbol) => String(symbol ?? '').trim().toUpperCase();

/**
 * 判斷是否為「缺少交易所後綴的台股代號」。
 * currency 有值時以 currency 為準；沒有 currency 時，純數字代號在美股不存在，
 * 因此仍視為台股（不會誤傷 AAPL / QQQ 之類的代號）。
 */
export const isBareTaiwanSymbol = (symbol, currency) => {
  const normalized = normalizeSymbol(symbol);
  if (hasExplicitSuffix(normalized)) return false;
  if (!TW_SYMBOL_PATTERN.test(normalized)) return false;

  const normalizedCurrency = String(currency ?? '').trim().toUpperCase();
  return normalizedCurrency === 'TWD' || normalizedCurrency === '';
};

/**
 * 產生查詢 Yahoo Finance 時要依序嘗試的代號清單。
 * 例：('0050', 'TWD') -> ['0050.TW', '0050.TWO']
 *     ('QQQ',  'USD') -> ['QQQ']
 */
export const buildSymbolCandidates = (symbol, currency) => {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return [];
  if (!isBareTaiwanSymbol(normalized, currency)) return [normalized];
  return TW_SUFFIXES.map((suffix) => `${normalized}${suffix}`);
};

/**
 * 取得單一「最合理」的代號，供寫入資料庫時使用（上市優先）。
 */
export const toCanonicalSymbol = (symbol, currency) => {
  const candidates = buildSymbolCandidates(symbol, currency);
  return candidates[0] || normalizeSymbol(symbol);
};

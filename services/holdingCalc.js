// 持股一律從該 symbol 的全部交易重新計算，不做增量加減，修改或刪除舊交易也不會越算越偏

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

// 平均成本法：買入成本含手續費；賣出依比例扣掉成本（均價不變）；股數歸零後重新起算
// txs 需已依 transaction_date、id 排序
export function computeHolding(txs) {
  let shares = 0;
  let cost = 0;
  for (const tx of txs) {
    const s = Number(tx.shares);
    if (tx.transaction_type === 'buy') {
      shares = round(shares + s, 2);
      cost += s * Number(tx.price) + Number(tx.fee ?? 0);
    } else if (tx.transaction_type === 'sell') {
      if (s > shares) {
        throw Object.assign(new Error(`Sell shares exceed holdings for symbol ${tx.symbol}`), { status: 400 });
      }
      cost -= shares ? (cost * s) / shares : 0;
      shares = round(shares - s, 2);
      if (shares === 0) cost = 0;
    }
  }
  const firstBuy = txs.find((tx) => tx.transaction_type === 'buy');
  const latest = (key) => txs.findLast((tx) => tx[key])?.[key] ?? null;
  return {
    shares,
    avgCost: shares > 0 ? round(cost / shares, 3) : 0,
    currency: firstBuy?.currency || txs[0]?.currency || 'USD',
    name: latest('name'),
    asset_type: latest('asset_type'),
  };
}

export async function recalcHolding(db, uid, portfolioId, symbol) {
  const txs = await db.transactions.findMany({
    where: { uid, portfolio_id: portfolioId, symbol },
    orderBy: [{ transaction_date: 'asc' }, { id: 'asc' }],
  });
  const h = computeHolding(txs);

  if (h.shares <= 0) {
    await db.holdings.deleteMany({ where: { uid, portfolio_id: portfolioId, symbol } });
    return;
  }

  const data = { total_shares: h.shares, avg_cost: h.avgCost, currency: h.currency, last_updated: new Date() };
  await db.holdings.upsert({
    where: { uid_symbol_portfolio: { uid, symbol, portfolio_id: portfolioId } },
    update: data,
    create: {
      ...data,
      users: { connect: { uid } },
      portfolios: { connect: { id: portfolioId } },
      symbol,
      name: h.name,
      asset_type: h.asset_type,
    },
  });
}

// 交易欄位的格式檢查（API 入口用），不合法回傳錯誤訊息，合法回傳 null
// 上限對應 schema：shares / fee 為 Decimal(10,2)、price 為 Decimal(10,3)、symbol 為 VarChar(10)
export function validateTransaction(tx) {
  const shares = Number(tx.shares), price = Number(tx.price), fee = Number(tx.fee ?? 0);
  if (typeof tx.symbol !== 'string' || !/^\S{1,10}$/.test(tx.symbol)) return 'symbol must be 1-10 non-blank characters';
  if (tx.transaction_type !== 'buy' && tx.transaction_type !== 'sell') return "transaction_type must be 'buy' or 'sell'";
  if (!(shares > 0 && shares < 1e8)) return 'shares must be a positive number';
  if (!(price > 0 && price < 1e7)) return 'price must be a positive number';
  if (!(fee >= 0 && fee < 1e8)) return 'fee must be a non-negative number';
  if (tx.transaction_date && isNaN(new Date(tx.transaction_date))) return 'transaction_date is not a valid date';
  return null;
}

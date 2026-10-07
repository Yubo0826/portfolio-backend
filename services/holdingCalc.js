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

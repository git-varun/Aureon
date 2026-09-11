import { prisma } from "../prisma";
import { resolvePositionsPriceMap } from "./prices";
import { toInr } from "./fx";
import { clampTrendDates, getPortfolioStateAtDate, indexPriceHistoryByAsset } from "./ai/intelligence";

export interface SnapshotResult {
  portfolio_id: string;
  market_value: number;
  cash_balance: number | null;
  daily_return: number;
  total_return: number;
  realized_pnl: number | null;
  updated_at: string;
}

/** Port of PortfolioService.generate_portfolio_snapshot. Computes market
 * value / cost basis per position (with the futures_coinm/futures_usdm
 * margin-based valuation Python uses instead of qty*price), normalizes every
 * position's native currency to INR before summing, then upserts the single
 * per-portfolio snapshots row. */
export async function generatePortfolioSnapshot(portfolioId: string): Promise<SnapshotResult> {
  const positions = await prisma.position.findMany({ where: { portfolioId } });
  const prices = await resolvePositionsPriceMap(positions);

  let marketValue = 0;
  let totalInvested = 0;

  for (const pos of positions) {
    const pp = prices.get(pos.id)!;
    const price = pp.price;
    const qty = Number(pos.quantity);
    let val: number;
    let cost: number;

    if (pos.wallet === "futures_coinm") {
      const margin = pos.marginUsd !== null ? Number(pos.marginUsd) : 0;
      val = margin + Number(pos.unrealizedPnl ?? 0);
      cost = margin;
    } else if (pos.wallet === "futures_usdm") {
      const leverage = pos.leverage ? Number(pos.leverage) : 1.0;
      const margin = Math.abs(qty * Number(pos.avgBuyPrice)) / leverage;
      val = margin + Number(pos.unrealizedPnl ?? 0);
      cost = margin;
    } else {
      val = price !== null ? qty * price : 0;
      cost = qty * Number(pos.avgBuyPrice);
    }

    marketValue += await toInr(val, pp.currency);
    totalInvested += await toInr(cost, pp.currency);
  }

  // All-time realized futures PnL/funding/commission — summed here rather
  // than stored as a running total on Position, since Position rows are
  // rebuilt from Binance's live state on every sync (see syncFuturesPositions
  // in brokerSync.ts) and shouldn't hold a durable running total themselves.
  // Scoped to wallet: "futures_usdm" only — COIN-M (`futures_coinm`) income
  // rows are settlement-coin-denominated (e.g. BTC/ETH quantities, not USD),
  // so summing them alongside USDM's USD-stablecoin amounts would silently
  // corrupt the aggregate; converting COIN-M correctly needs a per-row
  // historical price lookup, out of scope this wave. COIN-M income stays
  // visible in the Transaction ledger, just excluded from this figure.
  const REALIZED_PNL_TYPES = ["REALIZED_PNL", "FUNDING_FEE", "COMMISSION"];
  const incomeAgg = await prisma.transaction.aggregate({
    _sum: { quantity: true },
    where: { portfolioId, kind: "broker_income", wallet: "futures_usdm", transactionType: { in: REALIZED_PNL_TYPES } },
  });
  const realizedPnlUsd = Number(incomeAgg._sum.quantity ?? 0);
  const realizedPnlInr = await toInr(realizedPnlUsd, "USD");

  const totalReturn = marketValue - totalInvested + realizedPnlInr;
  const dailyReturn = 0.0; // Placeholder — no historical daily metrics in quotes, matches Python
  const now = new Date();

  const saved = await prisma.snapshots.upsert({
    where: { portfolio_id: portfolioId },
    create: {
      portfolio_id: portfolioId,
      market_value: marketValue,
      cash_balance: null,
      daily_return: dailyReturn,
      total_return: totalReturn,
      realized_pnl: realizedPnlInr,
      created_at: now,
      updated_at: now,
    },
    update: {
      market_value: marketValue,
      cash_balance: null,
      daily_return: dailyReturn,
      total_return: totalReturn,
      realized_pnl: realizedPnlInr,
      updated_at: now,
    },
  });

  return {
    portfolio_id: saved.portfolio_id,
    market_value: Number(saved.market_value),
    cash_balance: saved.cash_balance !== null ? Number(saved.cash_balance) : null,
    daily_return: Number(saved.daily_return),
    total_return: Number(saved.total_return),
    realized_pnl: saved.realized_pnl !== null ? Number(saved.realized_pnl) : null,
    updated_at: saved.updated_at.toISOString(),
  };
}

/** Port of PortfolioService._serialize_snapshot_for_cache. */
export function serializeSnapshotForCache(snapshot: SnapshotResult): Record<string, unknown> {
  return {
    portfolio_id: snapshot.portfolio_id,
    market_value: snapshot.market_value,
    cash_balance: snapshot.cash_balance,
    daily_return: snapshot.daily_return,
    total_return: snapshot.total_return,
    realized_pnl: snapshot.realized_pnl,
    updated_at: snapshot.updated_at,
  };
}

/** Port of PortfolioService.get_history, retargeted onto the same
 * day-by-day reconstruction the (already-fixed) health/diversification
 * trend endpoints use — see getPortfolioStateAtDate in ai/intelligence.ts
 * for its FX conversion, crypto_futures exclusion and broker_snapshot
 * override logic. The original implementation only ever replayed
 * kind: "trade" rows, which is zero rows for every broker-synced
 * portfolio (broker-synced trades are kind: "broker_trade"), so this
 * always returned an empty series for real data. */
export async function getPortfolioHistory(portfolioId: string, days: number): Promise<{ snapshots: { ts: string; value: number }[] }> {
  const transactions = await prisma.transaction.findMany({ where: { portfolioId }, orderBy: { transactionDate: "asc" } });
  const dates = clampTrendDates(days, transactions);
  if (dates.length === 0) return { snapshots: [] };

  const symbols = [...new Set(transactions.map((t) => t.symbol))];
  const assets = symbols.length > 0 ? await prisma.asset.findMany({ where: { symbol: { in: symbols } } }) : [];
  const assetsBySymbol = new Map(assets.map((a) => [a.symbol, a]));
  const assetIds = assets.map((a) => a.id);

  const priceHistory = assetIds.length > 0 ? await prisma.priceHistory.findMany({ where: { assetId: { in: assetIds } } }) : [];
  const priceHistoryByAsset = indexPriceHistoryByAsset(priceHistory);

  const snapshotsOut: { ts: string; value: number }[] = [];
  for (const d of dates) {
    const state = await getPortfolioStateAtDate(d, transactions, priceHistoryByAsset, assetsBySymbol);
    if (state.total_value > 0) {
      snapshotsOut.push({ ts: d.toISOString().slice(0, 10), value: Math.round(state.total_value * 100) / 100 });
    }
  }

  return { snapshots: snapshotsOut };
}

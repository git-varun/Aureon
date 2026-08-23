import { prisma } from "../prisma";
import { resolvePositionsPriceMap } from "./prices";
import { inferCurrency } from "./currency";
import { toInr } from "./fx";

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

const RECALC_TYPES = new Set(["BUY", "SELL", "BONUS", "SPLIT"]);

/** Port of PortfolioService.get_history. Reconstructs net-worth over time
 * from real trade-ledger Transaction + PriceHistory rows — see the Python
 * docstring for exactly which symbols/periods are (and aren't)
 * reconstructable. */
export async function getPortfolioHistory(portfolioId: string, days: number): Promise<{ snapshots: { ts: string; value: number }[] }> {
  const txns = await prisma.transaction.findMany({
    where: { portfolioId, transactionType: { in: [...RECALC_TYPES] }, kind: "trade" },
    orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
  });
  if (txns.length === 0) return { snapshots: [] };

  const symbols = [...new Set(txns.map((t) => t.symbol))].sort();
  const txnsBySymbol = new Map<string, typeof txns>();
  for (const t of txns) {
    const list = txnsBySymbol.get(t.symbol) ?? [];
    list.push(t);
    txnsBySymbol.set(t.symbol, list);
  }

  const assets = await prisma.asset.findMany({ where: { symbol: { in: symbols } } });
  const assetClassBySymbol = new Map(assets.map((a) => [a.symbol, a.assetClass]));
  const assetMetadataBySymbol = new Map(assets.map((a) => [a.symbol, a.metadata]));

  const priceRows = await prisma.priceHistory.findMany({
    where: { symbol: { in: symbols } },
    orderBy: { timestamp: "asc" },
  });
  const priceBySymbol = new Map<string, typeof priceRows>();
  for (const p of priceRows) {
    const list = priceBySymbol.get(p.symbol) ?? [];
    list.push(p);
    priceBySymbol.set(p.symbol, list);
  }

  function qtyAsOf(symbol: string, asOf: Date): number {
    let net = 0;
    for (const t of txnsBySymbol.get(symbol) ?? []) {
      if (t.transactionDate > asOf) break;
      const qty = Number(t.quantity);
      const price = Number(t.price);
      const tType = t.transactionType.toUpperCase();
      if (tType === "BUY") net += qty;
      else if (tType === "SELL") net = Math.max(net - qty, 0.0);
      else if (tType === "BONUS") net += qty;
      else if (tType === "SPLIT") {
        const multiplier = price || 1.0;
        if (multiplier > 0) net *= multiplier;
      }
    }
    return net;
  }

  function priceAsOf(symbol: string, asOf: Date): number | null {
    let best: (typeof priceRows)[number] | null = null;
    for (const p of priceBySymbol.get(symbol) ?? []) {
      if (p.timestamp > asOf) break;
      best = p;
    }
    return best !== null ? Number(best.price) : null;
  }

  // Python compares datetime.now(UTC).replace(tzinfo=None) directly against
  // the naive transaction_date/timestamp columns, treating them as already
  // UTC (get_history's own comment, unlike get_broker_transaction_coverage's
  // GUC-reversal elsewhere) — no naiveToUtc reinterpretation here. Per tz.ts,
  // Prisma's Date already has UTC getters equal to the raw column value, so a
  // plain `new Date()` compares correctly against it with zero conversion.
  const now = new Date();
  const requestedStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const earliestTxnDate = txns[0].transactionDate;
  const start = requestedStart > earliestTxnDate ? requestedStart : earliestTxnDate;

  const snapshotsOut: { ts: string; value: number }[] = [];
  for (let day = start; day <= now; day = new Date(day.getTime() + 24 * 60 * 60 * 1000)) {
    let value = 0;
    let contributed = false;
    for (const symbol of symbols) {
      const qty = qtyAsOf(symbol, day);
      if (qty <= 0) continue;
      const price = priceAsOf(symbol, day);
      if (price === null) continue;
      const currency = inferCurrency(assetClassBySymbol.get(symbol) ?? null, symbol, assetMetadataBySymbol.get(symbol) ?? null);
      value += await toInr(qty * price, currency);
      contributed = true;
    }
    if (contributed) {
      // Python's day.isoformat() on a naive datetime has no timezone suffix
      // (no "Z", no "+00:00") — match exactly, not toPythonIsoString's
      // tz-aware form.
      snapshotsOut.push({ ts: day.toISOString().replace("Z", ""), value: Math.round(value * 100) / 100 });
    }
  }

  return { snapshots: snapshotsOut };
}

import { v4 as uuidv4 } from "uuid";
import type { Prisma } from "../generated/prisma";
import { ensureAssetExists } from "./assets";

type Tx = Prisma.TransactionClient;

const RECALC_TRANSACTION_TYPES = new Set(["BUY", "SELL", "BONUS", "SPLIT", "VALUATION"]);

/** Port of PortfolioService.recalculate_position. Replays the symbol's
 * "trade" ledger (falling back to the latest broker_snapshot when there's no
 * ledger) into net_qty/avg_buy_price, then upserts or deletes the Position
 * row accordingly. broker_trade rows are never used for quantity — see the
 * Python docstring — only via _apply_trade_cost_basis elsewhere. */
export async function recalculatePosition(tx: Tx, portfolioId: string, symbolRaw: string, wallet = "spot"): Promise<void> {
  const symbol = symbolRaw.toUpperCase().trim();

  let txns = await tx.transaction.findMany({
    where: {
      portfolioId,
      symbol,
      transactionType: { in: [...RECALC_TRANSACTION_TYPES] },
      kind: "trade",
    },
    orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
  });

  if (txns.length === 0) {
    const snap = await tx.transaction.findFirst({
      where: { portfolioId, symbol, kind: "broker_snapshot", wallet },
      orderBy: { transactionDate: "desc" },
    });
    if (snap) txns = [snap];
  }

  let netQty = 0;
  let runningAvg = 0;

  for (const t of txns) {
    const qty = Number(t.quantity);
    const price = Number(t.price);
    const tType = t.transactionType.toUpperCase();

    if (tType === "BUY") {
      const newQty = netQty + qty;
      if (newQty > 0) {
        runningAvg = (netQty * runningAvg + qty * price) / newQty;
      }
      netQty = newQty;
    } else if (tType === "SELL") {
      netQty = Math.max(netQty - qty, 0.0);
    } else if (tType === "BONUS") {
      const newQty = netQty + qty;
      if (newQty > 0) {
        const priceVal = price || 0.0;
        runningAvg = (netQty * runningAvg + qty * priceVal) / newQty;
      }
      netQty = newQty;
    } else if (tType === "SPLIT") {
      const multiplier = price || 1.0;
      if (multiplier > 0) {
        netQty = netQty * multiplier;
        runningAvg = runningAvg / multiplier;
      }
    } else if (tType === "VALUATION") {
      // Manual revaluation: `price` is an absolute unit price, not a
      // SPLIT-style multiplier — must never touch net_qty/running_avg.
    }
  }

  const pos = await tx.position.findFirst({
    where: { portfolioId, symbol, wallet },
  });

  if (netQty <= 0) {
    if (pos && (pos.wallet === "futures_usdm" || pos.wallet === "futures_coinm")) {
      return;
    }
    if (pos) {
      await tx.position.delete({ where: { id: pos.id } });
    }
    return;
  }

  const assetId = await ensureAssetExists(tx, symbol);

  if (pos) {
    await tx.position.update({
      where: { id: pos.id },
      data: { quantity: netQty, avgBuyPrice: runningAvg, assetId, updatedAt: new Date() },
    });
  } else {
    await tx.position.create({
      data: {
        id: uuidv4(),
        portfolioId,
        symbol,
        assetId,
        quantity: netQty,
        avgBuyPrice: runningAvg,
        wallet,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
}

/** Port of PortfolioService._apply_trade_cost_basis (portfolio.py:1884-1925).
 * Derives avg_buy_price from kind="broker_trade" transactions using the same
 * running-average math as recalculatePosition, and applies it to the
 * existing Position WITHOUT touching quantity. Needed alongside
 * recalculatePosition wherever broker-synced symbols are replayed (broker
 * sync itself, and Restore) — recalculatePosition alone falls back to the
 * broker_snapshot row's placeholder price, which is not a real cost basis. */
export async function applyTradeCostBasis(tx: Tx, portfolioId: string, symbolRaw: string, wallet = "spot"): Promise<void> {
  const symbol = symbolRaw.toUpperCase().trim();
  const pos = await tx.position.findFirst({ where: { portfolioId, symbol, wallet } });
  if (!pos) return;

  const [trades, transfers] = await Promise.all([
    tx.transaction.findMany({
      where: { portfolioId, symbol, kind: "broker_trade", transactionType: { in: ["BUY", "SELL"] } },
    }),
    tx.transaction.findMany({
      where: { portfolioId, symbol, kind: "broker_transfer", transactionType: { in: ["DEPOSIT", "WITHDRAWAL"] } },
    }),
  ]);
  const ledger = [...trades, ...transfers].sort(
    (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime() || a.id.localeCompare(b.id),
  );
  if (ledger.length === 0) return;

  let netQty = 0;
  let runningAvg = 0;
  for (const t of ledger) {
    const qty = Number(t.quantity);
    const price = Number(t.price);
    const txnType = t.transactionType.toUpperCase();
    const isBuySide = txnType === "BUY" || txnType === "DEPOSIT";
    if (isBuySide) {
      // Zero-price skip is scoped to DEPOSIT only. A zero-priced deposit
      // (historical price lookup failed at ingestion — see
      // importBrokerTransfers) contributes real quantity via the live
      // balance snapshot elsewhere, but has no cost basis to contribute
      // here, so it must be skipped entirely (not folded into netQty
      // either) — otherwise it would silently sit in netQty as zero-cost
      // weight and drag the average down the moment the next priced
      // BUY/DEPOSIT arrives. Ordinary broker_trade BUY rows never hit this
      // guard: a zero-priced BUY has no equivalent "lookup failed, cost
      // unknown" story — importBrokerTrades writes whatever price the
      // exchange reported — so BUY rows keep the pre-existing unconditional
      // fold-into-netQty/runningAvg behavior this task must leave untouched.
      if (txnType === "DEPOSIT" && price <= 0) {
        continue;
      }
      const newQty = netQty + qty;
      if (newQty > 0) runningAvg = (netQty * runningAvg + qty * price) / newQty;
      netQty = newQty;
    } else {
      netQty = Math.max(netQty - qty, 0.0);
    }
  }

  if (runningAvg > 0) {
    await tx.position.update({ where: { id: pos.id }, data: { avgBuyPrice: runningAvg, updatedAt: new Date() } });
  }
}

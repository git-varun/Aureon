import { v4 as uuidv4 } from "uuid";
import type { Prisma } from "../../generated/prisma";
import { prisma } from "../../prisma";
import { ensureAssetExists } from "../assets";
import { recalculatePosition, applyTradeCostBasis } from "../positions";
import { STABLECOIN_ASSETS, WALLET_SUFFIXES, splitQuoteAsset } from "./binanceConstants";
import type { ZerodhaHolding } from "./zerodha/client";
import type { GrowwHolding } from "./groww/client";
import type { BinanceClient, BinanceSyncData } from "./binance/client";

type Tx = Prisma.TransactionClient;

export interface BrokerRow {
  symbol: string;
  quantity: number;
  avg_price: number;
  name: string;
  asset_class: string;
}

export interface SyncResult {
  status: "success";
  synced_holdings: number;
  removed: number;
  imported_trades?: number;
}

const STABLECOIN_SET = new Set<string>(STABLECOIN_ASSETS);

/** Port of PortfolioService._sync_broker_snapshot. Idempotent upsert of
 * normalized broker holdings into Position/Transaction, one broker_snapshot
 * Transaction row per symbol — only affects symbols with no manual
 * (non-broker_snapshot) transactions (recalculatePosition's existing
 * fallback logic prefers manual history whenever it exists). Rows with
 * quantity <= 0 are skipped (fully-sold/empty). */
export async function syncBrokerSnapshot(tx: Tx, portfolioId: string, broker: string, rows: BrokerRow[], wallet = "spot"): Promise<SyncResult> {
  const seenSymbols = new Set<string>();

  for (const row of rows) {
    const { symbol, quantity, avg_price: avgPrice } = row;
    if (quantity <= 0) continue;

    const assetId = await ensureAssetExists(tx, symbol);

    const asset = await tx.asset.findUnique({ where: { symbol } });
    const rowAssetClass = row.asset_class || "equity";
    if (!asset) {
      await tx.asset.create({
        data: {
          id: assetId,
          symbol,
          name: row.name || symbol,
          assetClass: rowAssetClass,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } else if (asset.assetClass !== rowAssetClass) {
      // Keeps a pre-existing Asset row's classification in sync with what the
      // broker sync now knows (e.g. a stablecoin synced before "stablecoin"
      // was a distinct asset_class from "crypto").
      await tx.asset.update({ where: { symbol }, data: { assetClass: rowAssetClass, updatedAt: new Date() } });
    }

    const existing = await tx.transaction.findFirst({
      where: { portfolioId, symbol, kind: "broker_snapshot", broker, wallet },
    });
    if (existing) {
      await tx.transaction.update({
        where: { id: existing.id },
        data: { quantity, price: avgPrice, transactionDate: new Date(), updatedAt: new Date() },
      });
    } else {
      await tx.transaction.create({
        data: {
          id: uuidv4(),
          portfolioId,
          symbol,
          assetId,
          transactionType: "BUY",
          quantity,
          price: avgPrice,
          transactionDate: new Date(),
          fees: 0,
          taxes: 0,
          broker,
          kind: "broker_snapshot",
          wallet,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    seenSymbols.add(symbol);
  }

  // Fully-sold holdings: remove the stale broker_snapshot so
  // recalculatePosition drops the Position.
  const stale = await tx.transaction.findMany({
    where: {
      portfolioId,
      broker,
      kind: "broker_snapshot",
      wallet,
      symbol: { notIn: [...seenSymbols] },
    },
  });
  const removedSymbols = new Set<string>();
  for (const t of stale) {
    removedSymbols.add(t.symbol);
    await tx.transaction.delete({ where: { id: t.id } });
  }

  for (const sym of new Set([...seenSymbols, ...removedSymbols])) {
    await recalculatePosition(tx, portfolioId, sym, wallet);
  }

  return { status: "success", synced_holdings: seenSymbols.size, removed: removedSymbols.size };
}

const EXCHANGE_SUFFIX: Record<string, string> = { NSE: ".NS", BSE: ".BO" };

/** Port of PortfolioService.sync_zerodha_holdings. */
export async function syncZerodhaHoldings(tx: Tx, portfolioId: string, holdings: ZerodhaHolding[]): Promise<SyncResult> {
  const rows: BrokerRow[] = [];
  for (const h of holdings) {
    const rawSymbol = String(h.tradingsymbol ?? "").toUpperCase().trim();
    if (!rawSymbol) continue;
    const suffix = EXCHANGE_SUFFIX[String(h.exchange ?? "").toUpperCase()] ?? "";
    const symbol = rawSymbol.endsWith(suffix) || !suffix ? rawSymbol : `${rawSymbol}${suffix}`;
    rows.push({
      symbol,
      quantity: Number(h.quantity ?? 0),
      avg_price: Number(h.average_price ?? 0),
      name: rawSymbol,
      asset_class: "equity",
    });
  }
  return syncBrokerSnapshot(tx, portfolioId, "zerodha", rows);
}

/** Port of PortfolioService.sync_groww_holdings. */
export async function syncGrowwHoldings(tx: Tx, portfolioId: string, holdings: GrowwHolding[]): Promise<SyncResult> {
  const rows: BrokerRow[] = [];
  for (const h of holdings) {
    const rawSymbol = String(h.trading_symbol ?? "").toUpperCase().trim();
    if (!rawSymbol) continue;
    const symbol = rawSymbol.endsWith(".NS") || rawSymbol.endsWith(".BO") ? rawSymbol : `${rawSymbol}.NS`;
    rows.push({
      symbol,
      quantity: Number(h.quantity ?? 0),
      avg_price: Number(h.average_price ?? 0),
      name: rawSymbol,
      asset_class: "equity",
    });
  }
  return syncBrokerSnapshot(tx, portfolioId, "groww", rows);
}

/** Port of PortfolioService._sync_spot_with_cost_basis. Atomic unit for
 * Spot/Earn: syncs the live balance snapshot, imports trade history, then
 * reapplies cost basis from that history — in that exact order, every time
 * (snapshot sync resets avg_buy_price via recalculatePosition, so cost basis
 * must be (re)applied *after* both snapshot sync and trade import, on every
 * call, not just when a new trade appears). */
async function syncSpotWithCostBasis(
  tx: Tx,
  portfolioId: string,
  broker: string,
  rows: BrokerRow[],
  spotTrades: Array<Record<string, unknown>>,
  wallet = "spot",
): Promise<SyncResult> {
  const result = await syncBrokerSnapshot(tx, portfolioId, broker, rows, wallet);
  const importedTrades = await importBrokerTrades(tx, portfolioId, broker, spotTrades, wallet);
  for (const row of rows) {
    await applyTradeCostBasis(tx, portfolioId, row.symbol, wallet);
  }
  return { ...result, imported_trades: importedTrades };
}

/** Port of PortfolioService._sync_futures_positions. Upserts Position rows
 * directly from Binance's positionRisk snapshot (USDⓈ-M or COIN-M). Bypasses
 * recalculatePosition's BUY/SELL transaction replay since a futures position
 * isn't a cost-basis ledger — it's a live, signed snapshot Binance itself
 * already nets out. */
async function syncFuturesPositions(tx: Tx, portfolioId: string, broker: string, wallet: string, positions: Array<Record<string, unknown>>): Promise<void> {
  const suffix = WALLET_SUFFIXES[wallet];
  const seenSymbols = new Set<string>();

  for (const p of positions) {
    const positionAmt = Number(p.positionAmt ?? 0);
    if (positionAmt === 0) continue;
    const rawSymbol = String(p.symbol ?? "").toUpperCase().trim();
    if (!rawSymbol) continue;
    const symbol = `${rawSymbol}-${suffix}`;
    seenSymbols.add(symbol);

    const assetId = await ensureAssetExists(tx, symbol);
    const asset = await tx.asset.findUnique({ where: { symbol } });
    if (!asset) {
      await tx.asset.create({
        data: { id: assetId, symbol, name: rawSymbol, assetClass: "crypto_futures", createdAt: new Date(), updatedAt: new Date() },
      });
    }

    let side = String(p.positionSide ?? "").toUpperCase();
    if (side !== "LONG" && side !== "SHORT") side = positionAmt > 0 ? "LONG" : "SHORT";

    const pos = await tx.position.findFirst({ where: { portfolioId, symbol } });

    let marginUsd: number | null = null;
    let unrealizedPnl: number | null = null;
    if (wallet === "futures_coinm") {
      // COIN-M's positionAmt is contracts, not coins, and unRealizedProfit is
      // settlement-coin-denominated, not USD — qty*entryPrice/leverage
      // (correct for USDⓈ-M) is meaningless here. contractSize is a fixed
      // USD notional per contract, so qty*contractSize/leverage is already a
      // real USD margin figure with no markPrice conversion needed.
      const contractSize = p.contractSize;
      const markPrice = p.markPrice;
      const leverage = p.leverage ? Number(p.leverage) : 1.0;
      if (contractSize !== null && contractSize !== undefined && markPrice !== null && markPrice !== undefined) {
        marginUsd = (Math.abs(positionAmt) * Number(contractSize)) / leverage;
        unrealizedPnl = Number(p.unRealizedProfit ?? 0) * Number(markPrice);
      } else {
        // Can't honestly compute either figure without contractSize/markPrice
        // — don't fabricate a wrong-unit number.
        marginUsd = null;
        unrealizedPnl = null;
      }
    } else {
      marginUsd = null;
      unrealizedPnl = Number(p.unRealizedProfit ?? 0);
    }

    const data = {
      quantity: positionAmt,
      avgBuyPrice: Number(p.entryPrice ?? 0),
      leverage: p.leverage !== null && p.leverage !== undefined ? Number(p.leverage) : null,
      liquidationPrice: p.liquidationPrice !== null && p.liquidationPrice !== undefined ? Number(p.liquidationPrice) : null,
      side,
      assetId,
      marginUsd,
      unrealizedPnl,
      updatedAt: new Date(),
    };

    if (pos) {
      await tx.position.update({ where: { id: pos.id }, data });
    } else {
      await tx.position.create({
        data: { id: uuidv4(), portfolioId, symbol, wallet, createdAt: new Date(), ...data },
      });
    }
  }

  const stale = await tx.position.findMany({
    where: {
      portfolioId,
      wallet,
      ...(seenSymbols.size > 0 ? { symbol: { notIn: [...seenSymbols] } } : {}),
    },
  });
  for (const pos of stale) {
    await tx.position.delete({ where: { id: pos.id } });
  }
}

/** Port of PortfolioService._import_broker_trades. Inserts Binance
 * trade-history rows as kind="broker_trade" Transactions (never used for
 * quantity — only via applyTradeCostBasis), deduped by
 * (portfolio_id, broker, broker_reference). Only Spot trades feed cost
 * basis; Futures positions are snapshot-synced separately. */
export async function importBrokerTrades(tx: Tx, portfolioId: string, broker: string, trades: Array<Record<string, unknown>>, wallet: string): Promise<number> {
  const candidates: Array<{ t: Record<string, unknown>; rawSymbol: string; brokerRef: string }> = [];
  for (const t of trades) {
    const tradeId = t.id ?? t.orderId;
    if (tradeId === undefined || tradeId === null) continue;
    const rawSymbol = String(t.symbol ?? "").toUpperCase().trim();
    if (!rawSymbol) continue;
    // Binance trade ids are only unique per symbol/market, not globally — the
    // dedup key must include wallet + the raw exchange symbol/pair, not just
    // the id.
    const brokerRef = `${wallet}:${rawSymbol}:${tradeId}`;
    candidates.push({ t, rawSymbol, brokerRef });
  }
  if (candidates.length === 0) return 0;

  const existingRows = await tx.transaction.findMany({
    where: { portfolioId, broker, brokerReference: { in: candidates.map((c) => c.brokerRef) } },
    select: { brokerReference: true },
  });
  const existingRefs = new Set(existingRows.map((r) => r.brokerReference));

  let committed = 0;
  const seenThisCall = new Set<string>();
  for (const { t, rawSymbol, brokerRef } of candidates) {
    if (existingRefs.has(brokerRef) || seenThisCall.has(brokerRef)) continue;
    seenThisCall.add(brokerRef);

    let symbol: string;
    let transactionType: string;
    if (wallet === "spot") {
      // Normalise to the same "{ASSET}-USD" symbol the balance sync uses, so
      // trade history reinforces the same Position instead of creating a
      // shadow one. Only pairs quoted in a USD stablecoin can be treated as
      // USD-priced directly; BTC/ETH/BNB-quoted pairs are explicitly skipped
      // here (still available via the CSV importer).
      const [base] = splitQuoteAsset(rawSymbol, STABLECOIN_ASSETS);
      if (base === null) continue;
      symbol = `${base}-USD`;
      transactionType = t.isBuyer ? "BUY" : "SELL";
    } else {
      const suffix = WALLET_SUFFIXES[wallet];
      symbol = `${rawSymbol}-${suffix}`;
      const side = String(t.side ?? "").toUpperCase();
      transactionType = side === "BUY" ? "BUY" : "SELL";
    }

    const assetId = await ensureAssetExists(tx, symbol);
    await tx.transaction.create({
      data: {
        id: uuidv4(),
        portfolioId,
        symbol,
        assetId,
        transactionType,
        quantity: Number(t.qty ?? t.quantity ?? 0),
        price: Number(t.price ?? 0),
        transactionDate: new Date(Number(t.time ?? 0)),
        fees: Number(t.commission ?? 0),
        taxes: 0,
        broker,
        brokerReference: brokerRef,
        kind: "broker_trade",
        // Deliberately NOT `wallet` (the real futures_usdm/futures_coinm/spot
        // wallet this trade came from) — Python's Transaction(...) call here
        // never sets wallet either (portfolio.py:1859-1871), so every
        // broker_trade row lands on the schema default "spot" regardless of
        // which wallet it's actually from. Harmless in both backends today —
        // _apply_trade_cost_basis's broker_trade query filters by symbol
        // only, no wallet, and futures/spot symbols never collide — but a
        // portfolio can accumulate broker_trade rows from both backends
        // across a rollout, so this must match Python's actual stored value
        // byte-for-byte, not just its functional effect.
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    committed += 1;
  }

  // Spot/Earn quantity must stay driven by the live balance snapshot
  // (authoritative), not by this trade ledger — see syncSpotWithCostBasis,
  // which applies cost basis for every synced spot symbol afterward, not
  // just ones with a newly-imported trade this round.
  return committed;
}

/** Port of PortfolioService.sync_binance_holdings. Spot and Earn are synced
 * as separate Positions (wallet="spot" / wallet="earn") sharing the same
 * symbol/Asset, since Earn is a real, distinct holding rather than merely
 * "the same coin as spot". Futures positions are leveraged derivatives with
 * no cost-basis ledger, so they're upserted directly from Binance's own
 * position snapshot. */
export async function syncBinanceHoldings(tx: Tx, portfolioId: string, holdings: BinanceSyncData): Promise<SyncResult> {
  const spotQuantities = new Map<string, number>();
  for (const b of holdings.spot ?? []) {
    let asset = String(b.asset ?? "").toUpperCase().trim();
    if (!asset) continue;
    // Simple Earn Flexible auto-subscribes free spot balance and holds it as
    // a distinct SPOT asset code prefixed "LD" (e.g. "LDBTC"), a
    // 1:1-redeemable receipt token for the real "BTC" — strip it so the
    // balance merges into the same Position as the real spot holding.
    if (asset.startsWith("LD") && asset.length > 2) asset = asset.slice(2);
    spotQuantities.set(asset, (spotQuantities.get(asset) ?? 0) + Number(b.free ?? 0) + Number(b.locked ?? 0));
  }

  const earnQuantities = new Map<string, number>();
  for (const e of holdings.earn ?? []) {
    const asset = String(e.asset ?? "").toUpperCase().trim();
    if (!asset) continue;
    const amount = Number(e.totalAmount ?? e.amount ?? 0);
    earnQuantities.set(asset, (earnQuantities.get(asset) ?? 0) + amount);
  }

  function toRows(quantities: Map<string, number>): BrokerRow[] {
    const rows: BrokerRow[] = [];
    for (const [asset, qty] of quantities) {
      if (qty <= 0) continue;
      rows.push({
        symbol: `${asset}-USD`,
        quantity: qty,
        avg_price: 0.0,
        name: asset,
        asset_class: STABLECOIN_SET.has(asset) ? "stablecoin" : "crypto",
      });
    }
    return rows;
  }

  const trades = holdings.trades ?? { spot: [], futures_usdm: [], futures_coinm: [] };
  const result = await syncSpotWithCostBasis(tx, portfolioId, "binance", toRows(spotQuantities), trades.spot ?? [], "spot");
  const earnResult = await syncSpotWithCostBasis(tx, portfolioId, "binance", toRows(earnQuantities), [], "earn");
  result.synced_holdings += earnResult.synced_holdings;
  result.removed += earnResult.removed;
  result.imported_trades = (result.imported_trades ?? 0) + (earnResult.imported_trades ?? 0);

  await syncFuturesPositions(tx, portfolioId, "binance", "futures_usdm", holdings.futures_usdm ?? []);
  await syncFuturesPositions(tx, portfolioId, "binance", "futures_coinm", holdings.futures_coinm ?? []);
  result.imported_trades += await importBrokerTrades(tx, portfolioId, "binance", trades.futures_usdm ?? [], "futures_usdm");
  result.imported_trades += await importBrokerTrades(tx, portfolioId, "binance", trades.futures_coinm ?? [], "futures_coinm");

  return result;
}

/** Port of PortfolioService.count_broker_positions. Python's join has no
 * wallet condition (Transaction.portfolio_id/symbol match Position's, but
 * not wallet), then DISTINCTs on the full Position row — since Position.id
 * is that row's primary key, DISTINCT p.id is equivalent. */
export async function countBrokerPositions(broker: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM (
      SELECT DISTINCT p.id
      FROM portfolio.positions p
      JOIN portfolio.transactions t
        ON t.portfolio_id = p.portfolio_id AND t.symbol = p.symbol
      WHERE t.broker = ${broker} AND t.kind = 'broker_snapshot'
    ) x
  `;
  return Number(rows[0]?.count ?? 0);
}

/** Port of PortfolioService.backfill_binance_spot. One-time full-history
 * Spot trade backfill, resumable via BinanceBackfillProgress checkpoints.
 * Spot only — Binance's futures trade-history endpoints don't feed any read
 * path today.
 *
 * Unlike the other sync functions in this file, this one takes `prisma`
 * directly and commits progressively (one short transaction per fetched
 * page), matching Python's per-page `self.session.commit()` inside the while
 * loop — not one big transaction, since this walks potentially many pages of
 * network calls (client.getSpotTradesPage) per symbol and a single
 * long-lived DB transaction across all of them would hold a connection open
 * for the entire backfill and risk a transaction timeout. */
export async function backfillBinanceSpot(portfolioId: string, client: BinanceClient): Promise<Record<string, unknown>> {
  const existingRefs = await prisma.transaction.findMany({
    where: { portfolioId, broker: "binance", brokerReference: { startsWith: "spot:" } },
    select: { brokerReference: true },
  });
  const knownSymbols = new Set<string>();
  for (const { brokerReference } of existingRefs) {
    if (!brokerReference) continue;
    const parts = brokerReference.split(":");
    if (parts.length >= 3) knownSymbols.add(parts[1]);
  }

  const symbols = await getBackfillSymbolUniverse(client, knownSymbols);

  let symbolsProcessed = 0;
  let symbolsSkipped = 0;
  let tradesFetchedTotal = 0;
  let tradesImportedTotal = 0;
  const touchedAppSymbols = new Set<string>();

  for (const symbol of symbols) {
    let progress = await prisma.binance_backfill_progress.findUnique({
      where: { portfolio_id_symbol: { portfolio_id: portfolioId, symbol } },
    });
    if (!progress) {
      progress = await prisma.binance_backfill_progress.create({
        data: { id: uuidv4(), portfolio_id: portfolioId, symbol, trades_fetched: 0, trades_imported: 0, done: false, created_at: new Date(), updated_at: new Date() },
      });
    }

    if (progress.done) {
      symbolsSkipped += 1;
      continue;
    }

    symbolsProcessed += 1;
    let fromId = progress.last_from_id !== null ? Number(progress.last_from_id) + 1 : 0;

    for (;;) {
      const page = await client.getSpotTradesPage(symbol, fromId, 1000);
      if (page.length === 0) {
        progress = await prisma.binance_backfill_progress.update({ where: { id: progress.id }, data: { done: true, updated_at: new Date() } });
        break;
      }

      const progressId: string = progress.id;
      const progressTradesFetched: number = progress.trades_fetched;
      const progressTradesImported: number = progress.trades_imported;
      const lastId: number = Math.max(...page.map((t) => Number(t.id ?? 0)));
      const done: boolean = page.length < 1000;

      const imported = await prisma.$transaction(async (tx) => {
        const n = await importBrokerTrades(tx, portfolioId, "binance", page, "spot");
        await tx.binance_backfill_progress.update({
          where: { id: progressId },
          data: {
            last_from_id: lastId,
            trades_fetched: progressTradesFetched + page.length,
            trades_imported: progressTradesImported + n,
            done,
            updated_at: new Date(),
          },
        });
        return n;
      });

      tradesFetchedTotal += page.length;
      tradesImportedTotal += imported;
      progress = await prisma.binance_backfill_progress.findUniqueOrThrow({ where: { id: progressId } });

      const [base] = splitQuoteAsset(symbol, STABLECOIN_ASSETS);
      if (base) touchedAppSymbols.add(`${base}-USD`);

      if (progress.done) break;
      fromId = lastId + 1;
    }
  }

  for (const appSymbol of touchedAppSymbols) {
    await prisma.$transaction((tx) => applyTradeCostBasis(tx, portfolioId, appSymbol));
  }

  return {
    symbols_total: symbols.length,
    symbols_processed: symbolsProcessed,
    symbols_skipped_already_done: symbolsSkipped,
    trades_fetched: tradesFetchedTotal,
    trades_imported: tradesImportedTotal,
    scope: "spot_only",
    note:
      "Covers Binance Spot trade history only — Futures trade history is not backfilled (Binance API limitation; no read path consumes futures trade history today).",
  };
}

/** Port of BinanceBrokerProvider.get_backfill_symbol_universe. */
async function getBackfillSymbolUniverse(client: BinanceClient, extraSymbols: Set<string>): Promise<string[]> {
  const spot = await client.getBalances();
  const earnFlexible = await client.getEarnFlexiblePositions().catch((e: Error) => {
    console.warn(`Binance backfill: Simple Earn flexible unavailable (likely missing API key permission): ${e.message}`);
    return [] as Array<Record<string, unknown>>;
  });
  const earnLocked = await client.getEarnLockedPositions().catch((e: Error) => {
    console.warn(`Binance backfill: Simple Earn locked unavailable (likely missing API key permission): ${e.message}`);
    return [] as Array<Record<string, unknown>>;
  });
  const earn = [...earnFlexible, ...earnLocked];

  const heldAssets = new Set<string>();
  for (const b of spot) {
    const asset = String(b.asset ?? "").toUpperCase();
    if (asset) heldAssets.add(asset);
  }
  for (const e of earn) {
    const asset = String(e.asset ?? "").toUpperCase();
    if (asset) heldAssets.add(asset);
  }

  const candidates = new Set<string>(heldAssets.size > 0 ? await client.getCandidateSpotSymbols(heldAssets) : []);
  for (const s of extraSymbols) candidates.add(s);
  return [...candidates].sort();
}

/** Port of PortfolioService.get_binance_backfill_status. */
export async function getBinanceBackfillStatus(portfolioId: string): Promise<Record<string, unknown>> {
  const rows = await prisma.binance_backfill_progress.findMany({ where: { portfolio_id: portfolioId } });
  return {
    symbols_total: rows.length,
    symbols_done: rows.filter((r) => r.done).length,
    trades_fetched: rows.reduce((sum, r) => sum + r.trades_fetched, 0),
    trades_imported: rows.reduce((sum, r) => sum + r.trades_imported, 0),
    symbols: rows.map((r) => ({ symbol: r.symbol, done: r.done, trades_fetched: r.trades_fetched, trades_imported: r.trades_imported })),
    scope: "spot_only",
    note: "Covers Binance Spot only — Futures trade history is not backfilled (Binance API limitation).",
  };
}

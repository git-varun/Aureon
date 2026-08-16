import { prisma } from "../../prisma";
import { NotFoundError } from "../errors";
import { computeDayPct } from "../marketProviders/sectors";
import { classify } from "./classify";
import { inferCurrency } from "../currency";
import { pyRound } from "./round";
import { searchMarket } from "./market";
import { toPythonIsoString } from "../tz";

// Port of AssetsService's module-level constants. Crypto-futures symbols
// (e.g. "ETHUSD_PERP-COINM") are structurally unresolvable by the
// Yahoo-based signal pipeline — Yahoo has no such ticker, so RSI/signal
// will never be computed for them. That's permanent, not "not available
// yet", so it shouldn't surface as a 404 the frontend keeps retrying
// against. Suffixes match binancePrice.ts's BASE_URL_BY_SUFFIX keys
// ("USDM"/"COINM", from app/core/binance.py's WALLET_SUFFIXES).
const UNRESOLVABLE_SIGNAL_SUFFIXES = ["-USDM", "-COINM"];

// NPS-/EPF-/MANUAL- prefixed symbols (portfolio importer / create_manual_asset)
// have no continuous price history feed — same permanent-unresolvable case.
const UNRESOLVABLE_SIGNAL_PREFIXES = ["NPS-", "EPF-", "MANUAL-"];

function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnresolvableForSignal(symbol: string): boolean {
  return (
    UNRESOLVABLE_SIGNAL_SUFFIXES.some((s) => symbol.endsWith(s)) ||
    UNRESOLVABLE_SIGNAL_PREFIXES.some((p) => symbol.startsWith(p))
  );
}

/** Port of _signal_confidence. How far RSI sits past the threshold that
 * triggered signal_type, scaled 0-100 — a real, deterministic function of
 * the same RSI value the signal itself is based on. */
function signalConfidence(rsi: number, signalType: string): number {
  let pct: number;
  if (signalType === "BUY") pct = ((40.0 - rsi) / 40.0) * 100.0;
  else if (signalType === "SELL") pct = ((rsi - 70.0) / 30.0) * 100.0;
  else pct = 100.0 - (Math.abs(rsi - 55.0) / 15.0) * 100.0;
  return pyRound(Math.max(0.0, Math.min(100.0, pct)), 0);
}

export interface SignalResult {
  symbol: string;
  rsi_14: number | null;
  signal_type: string | null;
  confidence: number | null;
  rationale: string;
  created_at: string;
}

function signalFromRsi(symbol: string, rsi: number): SignalResult {
  const signalType = rsi < 40 ? "BUY" : rsi > 70 ? "SELL" : "HOLD";
  return {
    symbol,
    rsi_14: rsi,
    signal_type: signalType,
    confidence: signalConfidence(rsi, signalType),
    rationale: `RSI is at ${rsi.toFixed(1)}. Recommending ${signalType}.`,
    created_at: toPythonIsoString(new Date()),
  };
}

/** Port of AssetsService.search — wraps MarketService.search into
 * {data, total}. */
export async function searchAssets(searchTerm: string): Promise<{ data: unknown[]; total: number }> {
  const results = await searchMarket(searchTerm);
  return { data: results, total: results.length };
}

/** Port of AssetsService.get_signal. */
export async function getSignal(symbolRaw: string): Promise<SignalResult> {
  const symbol = symbolRaw.toUpperCase().trim();

  if (isUnresolvableForSignal(symbol)) {
    return {
      symbol,
      rsi_14: null,
      signal_type: null,
      confidence: null,
      rationale: "Signal unavailable — this asset isn't covered by the price/indicator pipeline.",
      created_at: toPythonIsoString(new Date()),
    };
  }

  const quote = await prisma.latestQuote.findUnique({ where: { symbol } });
  if (!quote) throw new NotFoundError("Signal not found");

  const snap = quote.assetId ? await prisma.assetSnapshot.findUnique({ where: { assetId: quote.assetId } }) : null;
  if (!snap || snap.rsi === null) throw new NotFoundError("Signal not available yet");

  return signalFromRsi(symbol, Number(snap.rsi));
}

export interface BatchAssetOut {
  sym: string;
  name: string;
  price: number | null;
  dayPct: number | null;
  class: string;
  sector: string;
}

export interface BatchResult {
  asset: BatchAssetOut | null;
  signal: SignalResult | null;
}

/** Port of AssetsService.get_batch — batched asset-detail + signal lookup
 * for N symbols in one round trip. */
export async function getBatch(symbolsRaw: string[]): Promise<Record<string, BatchResult>> {
  const symbols = [...new Set(symbolsRaw.map((s) => s.toUpperCase().trim()).filter((s) => s))].sort();
  if (symbols.length === 0) return {};

  const [assets, quotes] = await Promise.all([
    prisma.asset.findMany({ where: { symbol: { in: symbols } } }),
    prisma.latestQuote.findMany({ where: { symbol: { in: symbols } } }),
  ]);
  const assetsBySymbol = new Map(assets.map((a) => [a.symbol, a]));
  const quotesBySymbol = new Map(quotes.map((q) => [q.symbol, q]));

  const assetIds = assets.map((a) => a.id);
  const snapshots = assetIds.length
    ? await prisma.assetSnapshot.findMany({ where: { assetId: { in: assetIds } } })
    : [];
  const snapshotsByAssetId = new Map(snapshots.map((s) => [s.assetId, s]));

  const results: Record<string, BatchResult> = {};
  for (const symbol of symbols) {
    const assetRow = assetsBySymbol.get(symbol) ?? null;
    const quote = quotesBySymbol.get(symbol) ?? null;
    const price = quote && quote.price !== null && Number(quote.price) !== 0 ? Number(quote.price) : null;

    let assetOut: BatchAssetOut | null = null;
    if (assetRow !== null) {
      const metadata = assetRow.metadata as Record<string, unknown> | null;
      const sector = metadata && typeof metadata === "object" && typeof metadata.sector === "string" ? metadata.sector : "General";
      assetOut = {
        sym: assetRow.symbol,
        name: assetRow.name,
        price,
        dayPct: quote ? await computeDayPct(quote.assetId) : null,
        class: classify(assetRow.assetClass, assetRow.symbol),
        sector,
      };
    }

    let signalOut: SignalResult | null = null;
    if (!isUnresolvableForSignal(symbol)) {
      const snap = assetRow ? snapshotsByAssetId.get(assetRow.id) : null;
      if (snap && snap.rsi !== null) {
        signalOut = signalFromRsi(symbol, Number(snap.rsi));
      }
    }

    results[symbol] = { asset: assetOut, signal: signalOut };
  }

  return results;
}

/** Port of AssetsService.get_aureon_asset. portfolioId is explicit (from
 * the request's query param), not "the first portfolio" — same fix as the
 * manual-asset endpoints — but left optional since this is a read: with no
 * portfolioId, the asset's market data still resolves, just without a held
 * position qty/cost. */
export async function getAureonAsset(tickerRaw: string, portfolioId: string | null): Promise<Record<string, unknown>> {
  const ticker = tickerRaw.toUpperCase().trim();
  const quote = await prisma.latestQuote.findUnique({ where: { symbol: ticker } });
  if (!quote) throw new NotFoundError("Asset not found");

  const asset = await prisma.asset.findUnique({ where: { symbol: ticker } });
  const name = asset ? asset.name : ticker;
  const assetClass = asset ? asset.assetClass : "equity";
  // Port of Python's `metadata.get("sector") if isinstance(metadata, dict)
  // else "General"` (AssetsService.get_aureon_asset) — same pattern as
  // getThemeDetail in themes.ts: a populated dict with no "sector" key
  // yields null, and "General" only applies when metadata itself isn't a
  // dict (asset.metadata_payload column is SQL NULL, or asset is absent).
  const rawMetadata: unknown = asset ? asset.metadata : {};
  const metadata: Record<string, unknown> = isPlainObjectRecord(rawMetadata) ? rawMetadata : {};
  const sector: string | null = isPlainObjectRecord(rawMetadata)
    ? ((rawMetadata.sector as string | undefined) ?? null)
    : "General";

  const snap = quote.assetId ? await prisma.assetSnapshot.findUnique({ where: { assetId: quote.assetId } }) : null;
  const price = quote.price !== null ? Number(quote.price) : null;

  // Combined view across a symbol's Position rows (e.g. Binance
  // wallet="spot" + wallet="earn" sharing one symbol) — weighted-average
  // cost across wallets, matching AssetsRepository.get_position's
  // CombinedPosition.
  let qty = 0.0;
  let cost: number | null = null;
  if (portfolioId) {
    const positions = await prisma.position.findMany({ where: { portfolioId, symbol: ticker } });
    if (positions.length > 0) {
      const totalQty = positions.reduce((sum, p) => sum + Number(p.quantity), 0);
      qty = totalQty;
      cost =
        totalQty > 0
          ? positions.reduce((sum, p) => sum + Number(p.quantity) * Number(p.avgBuyPrice), 0) / totalQty
          : Number(positions[0].avgBuyPrice);
    }
  }

  const history = quote.assetId
    ? await prisma.priceHistory.findMany({
        where: { assetId: quote.assetId },
        orderBy: { timestamp: "desc" },
        take: 30,
      })
    : [];
  const spark =
    history.length > 0 ? [...history].reverse().map((h) => Number(h.price)) : price !== null ? [price] : [];

  return {
    ticker,
    name,
    currentPrice: price,
    cost,
    qty,
    dayPct: null,
    marketCap: snap && snap.marketCap !== null ? Number(snap.marketCap) : null,
    peRatio: snap && snap.peRatio !== null ? Number(snap.peRatio) : null,
    rsi: snap && snap.rsi !== null ? Number(snap.rsi) : null,
    sentiment: snap && snap.sentimentScore !== null ? Number(snap.sentimentScore) : null,
    class: classify(assetClass, ticker),
    sector,
    spark,
    currency: inferCurrency(assetClass, ticker, metadata),
  };
}

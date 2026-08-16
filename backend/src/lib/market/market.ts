import { prisma } from "../../prisma";
import { NotFoundError } from "../errors";
import { computeDayPct } from "../marketProviders/sectors";
import { getCachedAssetSnapshot, getCachedAssetFeatures } from "../marketProviders/redisRateLimit";
import { inferExchangeRegion } from "../currency";
import { classify } from "./classify";
import { SYMBOL_SECTOR_MAP, INDEX_META } from "./constants";
import { looksLikeSymbol } from "../marketProviders/routing";
import { resolveAndTrackSymbol } from "./resolveAndTrack";
import { refreshPricesTask } from "../../jobs/refreshPrices";
import { adminBackfillAssets } from "../../jobs/adminMaintenance";

/** Port of MarketService.get_asset_snapshot. */
export async function getAssetSnapshot(assetId: string): Promise<Record<string, unknown>> {
  const cached = await getCachedAssetSnapshot(assetId);
  if (cached) return cached;

  const snapshot = await prisma.assetSnapshot.findUnique({ where: { assetId } });
  if (!snapshot) throw new NotFoundError("Asset snapshot not found");

  return {
    asset_id: snapshot.assetId,
    price: snapshot.price !== null ? Number(snapshot.price) : null,
    market_cap: snapshot.marketCap !== null ? Number(snapshot.marketCap) : null,
    pe_ratio: snapshot.peRatio !== null ? Number(snapshot.peRatio) : null,
    rsi: snapshot.rsi !== null ? Number(snapshot.rsi) : null,
    momentum_score: snapshot.momentumScore !== null ? Number(snapshot.momentumScore) : null,
    volatility_score: snapshot.volatilityScore !== null ? Number(snapshot.volatilityScore) : null,
    sentiment_score: snapshot.sentimentScore !== null ? Number(snapshot.sentimentScore) : null,
    payload: snapshot.payload,
    updated_at: snapshot.updatedAt.toISOString(),
  };
}

/** Port of MarketService.get_asset_features. */
export async function getAssetFeatures(assetId: string): Promise<Record<string, unknown>> {
  const cached = await getCachedAssetFeatures(assetId);
  if (cached) return cached;

  const features = await prisma.asset_features.findUnique({ where: { asset_id: assetId } });
  if (!features) throw new NotFoundError("Asset features not found");

  return {
    asset_id: features.asset_id,
    price: features.price !== null ? Number(features.price) : null,
    market_cap: features.market_cap !== null ? Number(features.market_cap) : null,
    momentum_score: features.momentum_score !== null ? Number(features.momentum_score) : null,
    volatility_score: features.volatility_score !== null ? Number(features.volatility_score) : null,
    sentiment_score: features.sentiment_score !== null ? Number(features.sentiment_score) : null,
    updated_at: features.updated_at.toISOString(),
  };
}

export interface IndexOut {
  sym: string;
  region: string;
  value: number;
  dayPct: number | null;
}

/** Port of MarketService.get_indices. */
export async function getIndices(): Promise<IndexOut[]> {
  const results: IndexOut[] = [];
  for (const { symbol, displayName, region } of INDEX_META) {
    const quote = await prisma.latestQuote.findUnique({ where: { symbol } });
    if (!quote) continue; // not yet ingested — skip rather than fabricate
    results.push({
      sym: displayName,
      region,
      value: Number(quote.price),
      dayPct: await computeDayPct(quote.assetId),
    });
  }
  return results;
}

export interface MoverOut {
  sym: string;
  name: string;
  price: number;
  dayPct: number | null;
  ex: string;
  region: string;
  class: string;
  sector: string;
}

/** Port of MarketService.get_movers. */
export async function getMovers(): Promise<{ gainers: MoverOut[]; losers: MoverOut[] }> {
  // Inner-join semantics matching MarketRepository.list_assets_with_latest_quote's
  // SQL join (LatestQuote.asset_id == Asset.id), NOT a join on symbol — a
  // LatestQuote row with a null asset_id (nullable in the schema, same real
  // state handled in getChart) is excluded by Python's join and must be
  // excluded here too. Asset has no declared Prisma relation to LatestQuote,
  // so the join is done in JS, keyed on asset_id like the SQL join is.
  const quotes = (await prisma.latestQuote.findMany()).filter(
    (q): q is typeof q & { assetId: string } => q.assetId !== null,
  );
  const assets = await prisma.asset.findMany({
    where: { id: { in: quotes.map((q) => q.assetId) }, assetClass: { not: "index" } },
  });
  const quoteByAssetId = new Map(quotes.map((q) => [q.assetId, q]));

  const scored: MoverOut[] = [];
  for (const asset of assets) {
    const quote = quoteByAssetId.get(asset.id);
    if (!quote) continue;
    const { exchange, region } = inferExchangeRegion(asset.symbol);
    scored.push({
      sym: asset.symbol,
      name: asset.name,
      price: Number(quote.price),
      dayPct: await computeDayPct(quote.assetId),
      ex: exchange,
      region,
      class: classify(asset.assetClass, asset.symbol),
      sector: SYMBOL_SECTOR_MAP[asset.symbol] ?? "General",
    });
  }

  scored.sort((a, b) => (b.dayPct ?? 0.0) - (a.dayPct ?? 0.0));
  const n = Math.min(5, Math.floor(scored.length / 2));
  const gainers = scored.slice(0, n);
  // n===0 guard: scored.slice(-0) would return the WHOLE array (JS quirk),
  // matching Python's `scored[-n:]` under n=0 giving the whole list too —
  // Python's source explicitly guards this with `if n else []`.
  const losers = n > 0 ? scored.slice(-n).reverse() : [];

  return { gainers, losers };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface SearchResultOut {
  sym: string;
  name: string;
  price: number | null;
  dayPct: number | null;
  ex: string;
  region: string;
  class: string;
  sector: string;
}

interface AssetRow {
  id: string;
  symbol: string;
  name: string;
  assetClass: string;
  metadata: unknown;
}

/** Port of MarketService.search. */
export async function searchMarket(qRaw: string): Promise<SearchResultOut[]> {
  const qClean = qRaw.toUpperCase().trim();

  // Exact match first, then LIMIT — matches Python's
  // `.order_by(Asset.symbol != q_clean).limit(10)`, which requires ordering
  // to happen strictly before the row cap. A findMany+take(10) with a
  // client-side sort would truncate to an arbitrary 10 rows first whenever
  // more than 10 rows match.
  const assets = await prisma.$queryRaw<AssetRow[]>`
    SELECT id, symbol, name, asset_class AS "assetClass", metadata
    FROM market.assets
    WHERE symbol LIKE '%' || ${qClean} || '%' OR name LIKE '%' || ${qRaw} || '%'
    ORDER BY (symbol <> ${qClean})
    LIMIT 10
  `;

  if (assets.length === 0) {
    // Phase D lazy on-demand tracking: no DB match, but the query might be
    // a real, not-yet-seen symbol — resolve it in the background. Must stay
    // fire-and-forget: a live provider call (0.3-8s) must never block the
    // search response the user is already looking at.
    if (looksLikeSymbol(qClean)) {
      resolveAndTrackSymbol(qClean).catch(() => {
        // resolveAndTrackSymbol already swallows its own expected failures;
        // this is a last-resort guard against an unexpected throw.
      });
    }
  }

  const results: SearchResultOut[] = [];
  for (const a of assets) {
    const quote = await prisma.latestQuote.findUnique({ where: { symbol: a.symbol } });
    const price = quote && quote.price !== null && Number(quote.price) !== 0 ? Number(quote.price) : null;
    const { exchange, region } = inferExchangeRegion(a.symbol);
    const sector = isPlainObject(a.metadata) && typeof a.metadata.sector === "string" ? a.metadata.sector : "General";
    results.push({
      sym: a.symbol,
      name: a.name,
      price,
      dayPct: quote ? await computeDayPct(quote.assetId) : null,
      ex: exchange,
      region,
      class: classify(a.assetClass, a.symbol),
      sector,
    });
  }
  return results;
}

/** Port of MarketService.get_universe. No ORDER BY in either backend — the
 * row SET (not sequence) is what must match, which means this can't use
 * prisma.asset.findMany({take}) the way most of this file does:
 * `take` without an explicit `orderBy` makes Prisma silently add its own
 * `ORDER BY id ASC` for pagination-stability reasons (confirmed via query
 * logging), which is a different physical scan than Python's plain
 * unordered `SELECT ... LIMIT 50` and was live-diffed to select a visibly
 * different 50-row subset of the >50-row assets table on real data — not a
 * theoretical concern. Raw SQL with no ORDER BY at all sidesteps Prisma's
 * implicit ordering and matches Python's actual (also ORDER-BY-less) plan. */
export async function getUniverse(search?: string): Promise<SearchResultOut[]> {
  const assets = search
    ? await prisma.$queryRaw<AssetRow[]>`
        SELECT id, symbol, name, asset_class AS "assetClass", metadata
        FROM market.assets
        WHERE symbol LIKE '%' || ${search.toUpperCase()} || '%' OR name LIKE '%' || ${search} || '%'
        LIMIT 50
      `
    : await prisma.$queryRaw<AssetRow[]>`
        SELECT id, symbol, name, asset_class AS "assetClass", metadata
        FROM market.assets
        LIMIT 50
      `;

  const results: SearchResultOut[] = [];
  for (const a of assets) {
    const quote = await prisma.latestQuote.findUnique({ where: { symbol: a.symbol } });
    const price = quote && quote.price !== null && Number(quote.price) !== 0 ? Number(quote.price) : null;
    const { exchange, region } = inferExchangeRegion(a.symbol);
    const sector = isPlainObject(a.metadata) && typeof a.metadata.sector === "string" ? a.metadata.sector : "General";
    results.push({
      sym: a.symbol,
      name: a.name,
      price,
      dayPct: quote ? await computeDayPct(quote.assetId) : null,
      ex: exchange,
      region,
      class: classify(a.assetClass, a.symbol),
      sector,
    });
  }
  return results;
}

/** Port of POST /market/refresh's Celery dispatch (refresh_prices_task.delay()).
 * BullMQ has no single-batch "task id" the way Celery's AsyncResult does —
 * frontend's apiService.refreshMarket()/AdminPanel button never reads
 * task_id (fire-and-forget UI state only), so null here is not a
 * regression, just an honest reflection of what actually exists. */
export async function refreshMarket(): Promise<{ status: string; task_id: null }> {
  await refreshPricesTask();
  return { status: "queued", task_id: null };
}

/** Port of MarketService's POST /market/symbols/{symbol}/backfill handler
 * (market.py:142, trigger_backfill). Python resolves the asset by
 * `symbol.upper().strip()`, 404s if not found, then fires
 * `admin_backfill_assets.delay([str(asset.id)])` without awaiting it. Task
 * 10 (2026-08-16 backend/ deletion cutover) ports the route itself —
 * `adminBackfillAssets` (backend/src/jobs/adminMaintenance.ts) already
 * existed as a ready-to-call runner but had no HTTP route until now. Same
 * `task_id: null` honesty as refreshMarket() above — the frontend
 * (AssetDetail.jsx's handleBackfill) never reads the response body. */
export async function triggerBackfill(symbol: string): Promise<{ status: string; symbol: string; task_id: null }> {
  const normalized = symbol.toUpperCase().trim();
  const asset = await prisma.asset.findUnique({ where: { symbol: normalized } });
  if (!asset) throw new NotFoundError("Asset not found");
  adminBackfillAssets([asset.id]);
  return { status: "queued", symbol, task_id: null };
}

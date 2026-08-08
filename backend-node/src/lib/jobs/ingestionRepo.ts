import { v4 as uuidv4, v5 as uuidv5 } from "uuid";
import { prisma } from "../../prisma";
import { Prisma } from "../../generated/prisma";
import type { Provider, Asset } from "../../generated/prisma";
import type { NormalizedQuote } from "../marketProviders/types";

export interface PriceHistoryRow {
  id: string;
  assetId: string;
  symbol: string;
  price: number;
  volume: number | null;
  timestamp: Date;
}

type Tx = Prisma.TransactionClient;

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/** Port of IngestionRepository.get_or_create_provider. Provider.id is a
 * random uuid4 (UUIDMixin default) — unlike Asset's deterministic uuid5(symbol),
 * there's no natural key to derive it from. */
export async function getOrCreateProvider(tx: Tx, providerName: string): Promise<Provider> {
  const existing = await tx.provider.findUnique({ where: { name: providerName } });
  if (existing) return existing;
  const now = new Date();
  return tx.provider.create({
    data: { id: uuidv4(), name: providerName, isEnabled: true, createdAt: now, updatedAt: now },
  });
}

/** Port of IngestionRepository.track_usage. */
export async function trackUsage(tx: Tx, providerId: string, endpoint: string): Promise<void> {
  const now = new Date();
  await tx.providerUsage.create({
    data: {
      id: uuidv4(),
      providerId,
      endpoint,
      requestCount: 1,
      costEstimate: 0,
      recordedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });
}

/** Port of IngestionRepository.mark_provider_healthy — deliberately its own
 * mini-transaction after save_quote's main commit, matching Python (a
 * failure here must not roll back the quote write that already succeeded). */
export async function markProviderHealthy(providerId: string): Promise<void> {
  await prisma.provider.update({
    where: { id: providerId },
    data: { lastSuccessAt: new Date(), healthStatus: "healthy" },
  });
}

/** Port of IngestionRepository.mark_provider_degraded. */
export async function markProviderDegraded(providerId: string): Promise<void> {
  await prisma.provider.update({ where: { id: providerId }, data: { healthStatus: "degraded" } });
}

/** Port of IngestionRepository.get_or_create_asset — narrower than
 * assets.ts's ensureAssetExists (market service's ensure_asset_exists port):
 * this one never touches asset_snapshot, matching Python's separate,
 * simpler ingestion-repository version used only by ingest_quote. */
export async function getOrCreateAsset(tx: Tx, symbol: string): Promise<Asset> {
  const existing = await tx.asset.findUnique({ where: { symbol } });
  if (existing) return existing;
  const now = new Date();
  return tx.asset.create({
    data: { id: uuidv5(symbol, UUID_NAMESPACE_DNS), symbol, name: symbol, assetClass: "equity", createdAt: now, updatedAt: now },
  });
}

/** Port of IngestionRepository.upsert_quote. */
export async function upsertQuote(tx: Tx, quote: NormalizedQuote, assetId: string): Promise<void> {
  await tx.latestQuote.upsert({
    where: { symbol: quote.symbol },
    create: {
      symbol: quote.symbol,
      assetId,
      price: quote.price,
      volume: quote.volume,
      provider: quote.provider,
      createdAt: quote.timestamp,
      updatedAt: quote.timestamp,
    },
    update: {
      price: quote.price,
      volume: quote.volume,
      assetId,
      provider: quote.provider,
      updatedAt: quote.timestamp,
    },
  });
}

/** Port of IngestionRepository.record_failure. */
export async function recordFailure(tx: Tx, providerName: string, symbol: string, error: string): Promise<void> {
  const now = new Date();
  await tx.failedIngestion.create({
    data: {
      id: uuidv4(),
      provider: providerName,
      payload: { symbol },
      error,
      attempts: 1,
      isExhausted: false,
      createdAt: now,
      updatedAt: now,
    },
  });
}

/** Port of IngestionRepository.record_price_history — deterministic id
 * (symbol + date), on-conflict-do-nothing so calling this more than once for
 * the same symbol+day is safe (no duplicate rows). */
export async function recordPriceHistory(tx: Tx, assetId: string, symbol: string, price: number, timestamp: Date): Promise<void> {
  const dateStr = timestamp.toISOString().slice(0, 10);
  await tx.priceHistory.createMany({
    data: [{ id: uuidv5(`${symbol}-${dateStr}`, UUID_NAMESPACE_DNS), assetId, symbol, price, timestamp }],
    skipDuplicates: true,
  });
}

/** Port of QuoteIngestionService.save_quote — the shared write path used by
 * both ingestQuote (per-symbol) and the tracked-crypto bulk refresh, so the
 * two never diverge on what a "saved quote" looks like. Returns the asset id. */
export async function saveQuote(providerName: string, quote: NormalizedQuote): Promise<string> {
  const { assetId, providerId } = await prisma.$transaction(async (tx) => {
    const provider = await getOrCreateProvider(tx, providerName);
    await trackUsage(tx, provider.id, "get_quote");
    const asset = await getOrCreateAsset(tx, quote.symbol);
    await upsertQuote(tx, quote, asset.id);
    if (quote.currency !== null) {
      const payload = { ...((asset.metadata as Record<string, unknown>) ?? {}), currency: quote.currency };
      await tx.asset.update({ where: { id: asset.id }, data: { metadata: payload } });
    }
    return { assetId: asset.id, providerId: provider.id };
  });

  try {
    await markProviderHealthy(providerId);
  } catch {
    // Matches Python: a health-mark failure must not roll back the quote write.
  }

  return assetId;
}

/** Port of IngestionRepository.list_tracked_symbols_for_refresh — (symbol,
 * asset_class) for is_tracked assets NOT already covered by
 * listSymbolsForQuoteIngestion's held/watchlisted hot path — kept disjoint
 * on purpose so a large tracked universe never adds load to the hourly
 * held/watchlisted refresh. */
export async function listTrackedSymbolsForRefresh(): Promise<Array<{ symbol: string; assetClass: string | null }>> {
  const [positions, watchlisted] = await Promise.all([
    prisma.position.findMany({ select: { symbol: true }, distinct: ["symbol"] }),
    prisma.watchlistSymbol.findMany({ select: { symbol: true }, distinct: ["symbol"] }),
  ]);
  const excluded = new Set([...positions.map((p) => p.symbol), ...watchlisted.map((w) => w.symbol)]);

  const assets = await prisma.asset.findMany({
    where: { isTracked: true },
    select: { symbol: true, assetClass: true },
    distinct: ["symbol"],
  });
  return assets.filter((a) => !excluded.has(a.symbol)).map((a) => ({ symbol: a.symbol, assetClass: a.assetClass }));
}

/** Port of IngestionRepository.list_mutual_fund_assets_with_quotes —
 * (asset_id, symbol) for every mutual_fund asset, used by the daily AMFI
 * NAV task. Not gated on an existing LatestQuote: mutual_fund Assets are
 * only ever created via a real holdings import. */
export async function listMutualFundAssetsWithQuotes(): Promise<Array<{ id: string; symbol: string }>> {
  return prisma.asset.findMany({
    where: { assetClass: "mutual_fund" },
    select: { id: true, symbol: true },
    distinct: ["symbol"],
  });
}

/** Port of MarketRepository.list_all_assets. */
export async function listAllAssets(): Promise<Asset[]> {
  return prisma.asset.findMany();
}

/** Port of MarketRepository.bulk_insert_price_history. */
export async function bulkInsertPriceHistory(rows: PriceHistoryRow[]): Promise<void> {
  if (rows.length === 0) return;
  await prisma.priceHistory.createMany({ data: rows, skipDuplicates: true });
}

/** Port of IngestionRepository.list_quoted_symbols — up to `limit` symbols
 * for fetchNewsTask to fetch this cycle, prioritized by staleness
 * (never-attempted symbols first, via a NULLS-FIRST ascending sort on
 * Asset.last_news_fetch_at). `crypto_quota` reserves that many slots for
 * asset_class == 'crypto' so it isn't starved by the larger equity pool. Raw
 * SQL: LatestQuote has no Prisma relation object to Asset (assetId is a bare
 * scalar FK), so a NULLS-FIRST order on the joined table isn't expressible
 * through the fluent query API. */
export async function listQuotedSymbols(limit: number, cryptoQuota = 4): Promise<string[]> {
  const pick = async (classFilter: Prisma.Sql, n: number): Promise<string[]> => {
    if (n <= 0) return [];
    const rows = await prisma.$queryRaw<Array<{ symbol: string }>>(Prisma.sql`
      SELECT lq.symbol
      FROM market.latest_quotes lq
      LEFT JOIN market.assets a ON a.id = lq.asset_id
      WHERE ${classFilter}
      ORDER BY a.last_news_fetch_at ASC NULLS FIRST
      LIMIT ${n}
    `);
    return rows.map((r) => r.symbol);
  };

  const cryptoSymbols = await pick(Prisma.sql`a.asset_class = 'crypto'`, cryptoQuota);
  const otherSymbols = await pick(
    Prisma.sql`(a.asset_class != 'crypto' OR a.asset_class IS NULL)`,
    limit - cryptoSymbols.length,
  );
  return [...cryptoSymbols, ...otherSymbols];
}

/** Port of IngestionRepository.mark_news_fetch_attempted — stamped
 * regardless of fetch outcome (including zero articles found) so
 * listQuotedSymbols' staleness ordering treats "we tried and found nothing"
 * as attempted, not permanently "never fetched" (see CRYPTO_SENTIMENT_GAP §1). */
export async function markNewsFetchAttempted(symbol: string): Promise<void> {
  await prisma.asset.updateMany({ where: { symbol }, data: { lastNewsFetchAt: new Date() } });
}

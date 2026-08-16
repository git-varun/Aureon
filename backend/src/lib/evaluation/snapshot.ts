import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma";
import { Prisma } from "../../generated/prisma";
import type { TechnicalIndicators } from "../marketProviders/yahoo";

export interface AssetSnapshotResult {
  asset_id: string;
  price: number | null;
  market_cap: number | null;
  pe_ratio: number | null;
  rsi: number | null;
  momentum_score: number | null;
  volatility_score: number | null;
  sentiment_score: number | null;
  payload: unknown;
  updated_at: string | null;
}

/** Port of SnapshotService.build_snapshot. Persists an AssetSnapshot +
 * PriceHistory point from the latest quote and pre-computed technical
 * indicators, and returns the Redis cache payload — unconditionally: despite
 * Python's own docstring claiming "or None if there is no quote to snapshot
 * yet," the actual Python code never returns None (there's no early-return
 * branch), it just upserts a snapshot with a null price. Matching the real
 * code, not the stale docstring.
 *
 * PriceHistory.id here is a random uuid4, not the uuid5(symbol+date) dedup
 * convention used by ingestQuote/seedPriceHistory/refreshMutualFundNavs —
 * matches Python's asset_snapshot.py exactly (a real, pre-existing
 * inconsistency in the Python source, not something to "fix" while porting:
 * every process_asset_snapshot run adds a fresh row, same day or not). */
export async function buildAssetSnapshot(assetId: string, indicators: Partial<TechnicalIndicators>): Promise<AssetSnapshotResult> {
  const quote = await prisma.latestQuote.findFirst({ where: { assetId } });
  const price = quote?.price != null ? Number(quote.price) : null;
  const volume = quote?.volume != null ? Number(quote.volume) : null;
  const symbol = quote?.symbol ?? null;

  const rsiVal = indicators.rsi ?? null;
  const momentumVal = rsiVal !== null ? rsiVal / 100.0 : null;
  const volatilityVal = indicators.volatility ?? null;
  const sentimentVal = indicators.sentiment ?? null;

  const now = new Date();
  const updated = await prisma.assetSnapshot.upsert({
    where: { assetId },
    create: {
      assetId,
      price,
      marketCap: null,
      peRatio: null,
      rsi: rsiVal,
      momentumScore: momentumVal,
      volatilityScore: volatilityVal,
      sentimentScore: sentimentVal,
      payload: (indicators as Prisma.InputJsonValue) ?? {},
      createdAt: now,
      updatedAt: now,
    },
    update: {
      price,
      rsi: rsiVal,
      momentumScore: momentumVal,
      volatilityScore: volatilityVal,
      sentimentScore: sentimentVal,
      payload: (indicators as Prisma.InputJsonValue) ?? {},
      updatedAt: now,
    },
  });

  if (price !== null && symbol !== null) {
    await prisma.priceHistory.create({
      data: { id: uuidv4(), assetId, symbol, price, volume, timestamp: now },
    });
  }

  return {
    asset_id: updated.assetId,
    price: updated.price != null ? Number(updated.price) : null,
    market_cap: updated.marketCap != null ? Number(updated.marketCap) : null,
    pe_ratio: updated.peRatio != null ? Number(updated.peRatio) : null,
    rsi: updated.rsi != null ? Number(updated.rsi) : null,
    momentum_score: updated.momentumScore != null ? Number(updated.momentumScore) : null,
    volatility_score: updated.volatilityScore != null ? Number(updated.volatilityScore) : null,
    sentiment_score: updated.sentimentScore != null ? Number(updated.sentimentScore) : null,
    payload: updated.payload,
    updated_at: updated.updatedAt.toISOString(),
  };
}

import { prisma } from "../../prisma";
import { ValidationError } from "../errors";

/** Port of validate_features — price only; market_cap/momentum_score/
 * volatility_score/sentiment_score are allowed to be null and are handled
 * downstream as partial/unavailable, not rejected here. */
export function validateFeatures(features: { price: number | null }): void {
  if (features.price === null) throw new ValidationError("Missing required values");
  if (features.price < 0) throw new ValidationError("Values out of numeric bounds");
  if (features.price > 1_000_000_000) throw new ValidationError("Outliers detected");
}

export interface AssetFeaturesResult {
  asset_id: string;
  price: number | null;
  market_cap: number | null;
  momentum_score: number | null;
  volatility_score: number | null;
  sentiment_score: number | null;
  updated_at: string | null;
}

/** Port of FeatureGenerationService.generate. Builds AssetFeatures from the
 * latest AssetSnapshot plus the rolling AssetSentimentSnapshot aggregate.
 * Returns null if there is no snapshot yet (unlike buildAssetSnapshot, this
 * one's null-return really is reachable in the code). */
export async function generateFeaturesFor(assetId: string): Promise<AssetFeaturesResult | null> {
  const snapshot = await prisma.assetSnapshot.findUnique({ where: { assetId } });
  if (!snapshot) return null;

  const sentimentSnapshot = await prisma.asset_sentiment_snapshots.findFirst({
    where: { asset_id: assetId },
    orderBy: { snapshot_date: "desc" },
  });
  // AssetSentimentSnapshot.avg_sentiment_7d is on the -1..1 per-article
  // scale; AssetFeatures.sentiment_score (and the recommendation rule
  // engine) assume 0..1 — convert once, here, at the aggregation boundary.
  const sentimentScore =
    sentimentSnapshot?.avg_sentiment_7d != null ? (sentimentSnapshot.avg_sentiment_7d + 1.0) / 2.0 : null;

  const price = snapshot.price != null ? Number(snapshot.price) : null;
  const marketCap = snapshot.marketCap != null ? Number(snapshot.marketCap) : null;
  const momentumScore = snapshot.momentumScore != null ? Number(snapshot.momentumScore) : null;
  const volatilityScore = snapshot.volatilityScore != null ? Number(snapshot.volatilityScore) : null;

  validateFeatures({ price });

  const now = new Date();
  const updated = await prisma.asset_features.upsert({
    where: { asset_id: assetId },
    create: {
      asset_id: assetId, price, market_cap: marketCap, momentum_score: momentumScore,
      volatility_score: volatilityScore, sentiment_score: sentimentScore, created_at: now, updated_at: now,
    },
    update: {
      price, market_cap: marketCap, momentum_score: momentumScore,
      volatility_score: volatilityScore, sentiment_score: sentimentScore, updated_at: now,
    },
  });

  return {
    asset_id: updated.asset_id,
    price: updated.price != null ? Number(updated.price) : null,
    market_cap: updated.market_cap != null ? Number(updated.market_cap) : null,
    momentum_score: updated.momentum_score != null ? Number(updated.momentum_score) : null,
    volatility_score: updated.volatility_score != null ? Number(updated.volatility_score) : null,
    sentiment_score: updated.sentiment_score != null ? Number(updated.sentiment_score) : null,
    updated_at: updated.updated_at.toISOString(),
  };
}

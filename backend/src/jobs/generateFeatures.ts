import type { TechnicalIndicators } from "../lib/marketProviders/yahoo";
import { aggregateAssetSentiment } from "../lib/news/sentiment";
import { generateFeaturesFor } from "../lib/evaluation/features";
import { cacheAssetFeatures } from "../lib/evaluation/cache";
import { generateSignals } from "./generateSignals";

/** Port of generate_features. Recomputes the rolling sentiment aggregate on
 * this same cadence (per-article sentiment itself is computed once, at news
 * ingestion), builds/persists AssetFeatures, caches the result, then relays
 * the indicators computed by processAssetSnapshot (if chained from it, else
 * undefined) so generateSignals doesn't re-fetch them for standalone calls
 * (admin reprocess/backfill/repair paths). */
export async function generateFeatures(assetId: string, indicators?: Partial<TechnicalIndicators>): Promise<void> {
  await aggregateAssetSentiment(assetId);

  const cacheData = await generateFeaturesFor(assetId);
  if (cacheData) await cacheAssetFeatures(assetId, cacheData);

  await generateSignals(assetId, indicators);
}

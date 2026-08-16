import { prisma } from "../prisma";
import { getTechnicalIndicators, type TechnicalIndicators } from "../lib/marketProviders/yahoo";
import { buildAssetSnapshot } from "../lib/evaluation/snapshot";
import { cacheAssetSnapshot } from "../lib/evaluation/cache";
import { generateFeatures } from "./generateFeatures";

/** Port of process_asset_snapshot. Fetches technical indicators for the
 * asset's symbol (if it has a LatestQuote yet), builds/persists the
 * AssetSnapshot + a PriceHistory point, caches the result, then chains into
 * generateFeatures — passing the already-fetched indicators through so it
 * doesn't make its own redundant getTechnicalIndicators call for the same
 * symbol moments later. */
export async function processAssetSnapshot(assetId: string): Promise<void> {
  const quote = await prisma.latestQuote.findFirst({ where: { assetId } });
  const symbol = quote?.symbol ?? null;

  let indicators: Partial<TechnicalIndicators> = {};
  if (symbol) {
    indicators = await getTechnicalIndicators(symbol);
  }

  const cacheData = await buildAssetSnapshot(assetId, indicators);
  if (cacheData) await cacheAssetSnapshot(assetId, cacheData);

  await generateFeatures(assetId, indicators);
}

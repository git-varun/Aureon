import { computeAssetHealthFor } from "../lib/evaluation/assetHealth";
import { cacheAssetHealth } from "../lib/evaluation/cache";

/** Port of compute_asset_health. */
export async function computeAssetHealth(assetId: string): Promise<void> {
  const cacheData = await computeAssetHealthFor(assetId);
  await cacheAssetHealth(assetId, cacheData);
}

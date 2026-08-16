import { generateAndScoreAsset } from "../lib/evaluation/scoring";
import { computeAssetHealth } from "./computeAssetHealth";

/** Port of generate_scores. */
export async function generateScores(assetId: string): Promise<void> {
  const scored = await generateAndScoreAsset(assetId);
  if (scored) await computeAssetHealth(assetId);
}

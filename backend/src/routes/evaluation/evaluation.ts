import { Router } from "express";
import { prisma } from "../../prisma";
import { NotFoundError } from "../../lib/errors";
import { requireUuidParam } from "../../lib/validation";
import { getCachedAssetScores } from "../../lib/evaluation/cache";

export const evaluationRouter = Router();

interface AssetScoresResponse {
  asset_id: string;
  model_version: string;
  recommendation_score: number | null;
  quality_score: number | null;
  valuation_score: number | null;
  unavailable_inputs: unknown;
  generated_at: string | null;
}

// Port of EvaluationService.get_asset_scores.
evaluationRouter.get("/assets/:assetId/scores", async (req, res) => {
  const { assetId } = req.params;
  requireUuidParam(assetId, "asset_id");
  const modelVersion = typeof req.query.model_version === "string" ? req.query.model_version : "v1.0.0";

  const cached = await getCachedAssetScores<AssetScoresResponse>(assetId);
  if (cached && cached.model_version === modelVersion) {
    res.json(cached);
    return;
  }

  const scores = await prisma.assetScore.findUnique({
    where: { assetId_modelVersion: { assetId, modelVersion } },
  });
  if (!scores) throw new NotFoundError("Asset scores not found");

  res.json({
    asset_id: scores.assetId,
    model_version: scores.modelVersion,
    recommendation_score: scores.recommendationScore != null ? Number(scores.recommendationScore) : null,
    quality_score: scores.qualityScore != null ? Number(scores.qualityScore) : null,
    valuation_score: scores.valuationScore != null ? Number(scores.valuationScore) : null,
    unavailable_inputs: scores.unavailableInputs ?? [],
    generated_at: scores.generatedAt ? scores.generatedAt.toISOString() : null,
  });
});

import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma";
import { computeQualityValuationScores } from "../ai/fundamentalsScoring";
import { scoreAndMaterialize } from "../ai/recommendation";
import { validateFeatures } from "./features";
import { cacheAssetScores, getCachedAssetSignals, invalidateOrgRecommendations } from "./cache";

const MODEL_VERSION = "v1.0.0";
const FEATURE_SCHEMA_VERSION = "1.0";

/** Port of materialize_for_asset — loads the snapshot/features/latest score
 * already persisted for this asset and runs the deterministic rule engine
 * against them.
 *
 * Deliberately does NOT call update_financial_intelligence_pipeline (the
 * outcome-realized-impact refresh + intelligence-cache/dashboard rebuild)
 * — that pulls in FinancialIntelligenceService.get_dashboard_aggregation,
 * which composes several sub-aggregations not yet ported (recent-outcomes
 * serialization, latest-briefing summary) and belongs to migration plan
 * Task 8 (Intelligence gaps), not Task 2. Concrete consequence: while an
 * asset is scored through this Node path, its contribution to
 * `intelligence:*` Redis caches and any RecommendationOutcome.realized_impact
 * recompute does NOT happen here — those stay stale for this asset until
 * either Python's equivalent materialize_for_asset call runs for it, or
 * Task 8 ports update_financial_intelligence_pipeline. */
export async function materializeForAsset(assetId: string): Promise<void> {
  const [snapshot, features, scores] = await Promise.all([
    prisma.assetSnapshot.findUnique({ where: { assetId } }),
    prisma.asset_features.findUnique({ where: { asset_id: assetId } }),
    prisma.assetScore.findFirst({ where: { assetId }, orderBy: { generatedAt: "desc" } }),
  ]);
  if (!snapshot || !features || !scores) return;

  const rec = await scoreAndMaterialize(
    assetId,
    { momentum_score: features.momentum_score, volatility_score: features.volatility_score, sentiment_score: features.sentiment_score },
    { quality_score: scores.qualityScore, valuation_score: scores.valuationScore },
  );
  if (rec === null) return;

  await invalidateOrgRecommendations();
}

/** Port of RecommendationService.generate_and_score_asset. Validates an
 * asset's latest features, computes recommendation/quality/valuation
 * scores, persists a FeatureSnapshot + AssetScore, caches the result, and
 * materializes recommendations from it. Returns false (no-op) if the asset
 * has no features yet. */
export async function generateAndScoreAsset(assetId: string): Promise<boolean> {
  const assetFeatures = await prisma.asset_features.findUnique({ where: { asset_id: assetId } });
  if (!assetFeatures) return false;

  const featuresDict = {
    price: assetFeatures.price != null ? Number(assetFeatures.price) : null,
    market_cap: assetFeatures.market_cap != null ? Number(assetFeatures.market_cap) : null,
    momentum_score: assetFeatures.momentum_score != null ? Number(assetFeatures.momentum_score) : null,
    volatility_score: assetFeatures.volatility_score != null ? Number(assetFeatures.volatility_score) : null,
    sentiment_score: assetFeatures.sentiment_score != null ? Number(assetFeatures.sentiment_score) : null,
  };
  validateFeatures(featuresDict);

  const signals = await getCachedAssetSignals<{ action?: string }>(assetId);
  const action = signals?.action ?? "HOLD";

  const { momentum_score: momentum, volatility_score: volatility, sentiment_score: sentiment } = featuresDict;
  const unavailableInputs: string[] = [];

  // Compute recommendation_score from whichever of momentum/volatility/
  // sentiment are actually present, renormalizing their base weights
  // (0.4/0.3/0.3) over just the available inputs — a partial score from
  // real data, never a fabricated neutral substitute for a missing one.
  const weightedTerms: Array<[number, number]> = [];
  if (momentum !== null) weightedTerms.push([0.4, momentum]);
  else unavailableInputs.push("momentum_score");
  if (volatility !== null) weightedTerms.push([0.3, 1.0 - volatility]);
  else unavailableInputs.push("volatility_score");
  if (sentiment !== null) weightedTerms.push([0.3, sentiment]);
  else unavailableInputs.push("sentiment_score");

  let recommendationScore: number | null = null;
  if (weightedTerms.length > 0) {
    const totalWeight = weightedTerms.reduce((sum, [w]) => sum + w, 0);
    let recScore = weightedTerms.reduce((sum, [w, v]) => sum + w * v, 0) / totalWeight;
    if (action === "BUY") recScore = Math.min(1.0, recScore + 0.1);
    else if (action === "SELL") recScore = Math.max(0.0, recScore - 0.1);
    recommendationScore = Math.max(0.0, Math.min(1.0, recScore));
  }

  // Real quality/valuation scoring from AssetFundamentals, equities only —
  // crypto/funds/NPS/EPF have no fundamentals data source and stay
  // "unavailable".
  const [asset, fundamentals] = await Promise.all([
    prisma.asset.findUnique({ where: { id: assetId } }),
    prisma.assetFundamentals.findUnique({ where: { assetId } }),
  ]);
  const { qualityScore, valuationScore, unavailableInputs: fundamentalsUnavailable } = computeQualityValuationScores(
    asset?.assetClass ?? null,
    fundamentals,
  );
  unavailableInputs.push(...fundamentalsUnavailable);

  const now = new Date();

  await prisma.feature_snapshots.create({
    data: { id: uuidv4(), asset_id: assetId, snapshot_at: now, model_version: MODEL_VERSION, feature_schema_version: FEATURE_SCHEMA_VERSION, features: featuresDict },
  });

  const updatedScore = await prisma.assetScore.upsert({
    where: { assetId_modelVersion: { assetId, modelVersion: MODEL_VERSION } },
    create: {
      assetId, modelVersion: MODEL_VERSION, recommendationScore, qualityScore, valuationScore,
      unavailableInputs, generatedAt: now,
    },
    update: { recommendationScore, qualityScore, valuationScore, unavailableInputs, generatedAt: now },
  });

  await cacheAssetScores(assetId, {
    asset_id: updatedScore.assetId,
    model_version: updatedScore.modelVersion,
    recommendation_score: updatedScore.recommendationScore != null ? Number(updatedScore.recommendationScore) : null,
    quality_score: updatedScore.qualityScore != null ? Number(updatedScore.qualityScore) : null,
    valuation_score: updatedScore.valuationScore != null ? Number(updatedScore.valuationScore) : null,
    unavailable_inputs: updatedScore.unavailableInputs,
    generated_at: updatedScore.generatedAt.toISOString(),
  });

  await materializeForAsset(assetId);

  return true;
}

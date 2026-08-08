import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma";
import type { Prisma, recommendations as Recommendation } from "../../generated/prisma";

// Port of the parts of app/modules/ai/services/recommendation.py needed by
// this phase: the deterministic rule engine (_score_and_materialize) and the
// manual-batch trigger (generate_recommendations). apply/dismiss/undo and
// materialize_for_asset/update_financial_intelligence_pipeline are
// deliberately out of scope for this pass (see Phase 8 handoff) — they drag
// in Redis cache *setters* that don't exist in Node yet.

export interface SerializedRecommendation {
  id: string;
  asset_id: string;
  symbol: string | null;
  recommendation_state: string;
  confidence_score: number;
  status: string;
  version: string;
  created_at: string | null;
  updated_at: string | null;
  explanation: {
    rules_matched: unknown;
    reasoning: string;
    confidence_factors: unknown;
  } | null;
  outcome: {
    status: string;
    action_taken_at: string | null;
    dismiss_reason: string | null;
    ledger_transaction_id: string | null;
    predicted_impact: number | null;
    realized_impact: number | null;
  } | null;
}

/** Port of serialize_recommendation. */
export async function serializeRecommendation(rec: Recommendation): Promise<SerializedRecommendation> {
  const expl = await prisma.recommendation_explanations.findUnique({ where: { recommendation_id: rec.id } });
  const out = await prisma.recommendation_outcomes.findUnique({ where: { recommendation_id: rec.id } });
  const quote = await prisma.latestQuote.findFirst({ where: { assetId: rec.asset_id } });

  return {
    id: rec.id,
    asset_id: rec.asset_id,
    symbol: quote?.symbol ?? null,
    recommendation_state: rec.recommendation_state,
    confidence_score: Number(rec.confidence_score),
    status: rec.status,
    version: rec.version,
    created_at: rec.created_at?.toISOString() ?? null,
    updated_at: rec.updated_at?.toISOString() ?? null,
    explanation: expl
      ? { rules_matched: expl.rules_matched, reasoning: expl.reasoning, confidence_factors: expl.confidence_factors }
      : null,
    outcome: out
      ? {
          status: out.status,
          action_taken_at: out.action_taken_at?.toISOString() ?? null,
          dismiss_reason: out.dismiss_reason,
          ledger_transaction_id: out.ledger_transaction_id,
          predicted_impact: out.predicted_impact !== null ? Number(out.predicted_impact) : null,
          realized_impact: out.realized_impact !== null ? Number(out.realized_impact) : null,
        }
      : null,
  };
}

interface Features {
  momentum_score: unknown;
  volatility_score: unknown;
  sentiment_score: unknown;
}
interface Scores {
  quality_score: unknown;
  valuation_score: unknown;
}

/** Port of _score_and_materialize. Returns null without writing anything if
 * a required factor hasn't been computed yet — never fabricates a neutral
 * substitute for a missing value.
 *
 * Crypto has no fundamentals analog (FUNDAMENTALS_SCORING_SCOPE.md §6) so
 * quality_score/valuation_score are permanently null for it — the gate and
 * rule engine branch on asset_class so crypto materializes off
 * momentum/volatility/sentiment alone instead of staying dark forever. */
export async function scoreAndMaterialize(assetId: string, features: Features, scores: Scores): Promise<Recommendation | null> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  const isCrypto = asset !== null && asset.assetClass === "crypto";

  const requiredFactors = isCrypto
    ? [features.momentum_score, features.volatility_score, features.sentiment_score]
    : [features.momentum_score, features.volatility_score, features.sentiment_score, scores.quality_score, scores.valuation_score];

  if (requiredFactors.some((f) => f === null || f === undefined)) return null;

  const momentum = Number(features.momentum_score);
  const volatility = Number(features.volatility_score);
  const sentiment = Number(features.sentiment_score);

  let recState = "HOLD";
  let reasoning = "Asset parameters remain within stable bounds. Recommending holding current position.";
  let rulesMatched: Prisma.InputJsonValue = {};
  let confidenceFactors: Prisma.InputJsonValue = {};
  let confidenceScore = 0.5;

  if (isCrypto) {
    if (momentum >= 0.5 && sentiment >= 0.5) {
      recState = "BUY";
      reasoning = "Asset displays positive momentum combined with constructive market sentiment (crypto: no valuation signal available).";
      rulesMatched = { momentum_and_sentiment: true };
      confidenceFactors = { momentum: 0.5, sentiment: 0.5 };
      confidenceScore = 0.5 * momentum + 0.5 * sentiment;
    } else if (sentiment < 0.3 && momentum < 0.4) {
      recState = "AVOID";
      reasoning = "Asset displays weak market sentiment and negative momentum, prompting caution.";
      rulesMatched = { weak_sentiment_and_momentum: true };
      confidenceFactors = { sentiment: 0.5, momentum: 0.5 };
      confidenceScore = 0.5 * (1.0 - sentiment) + 0.5 * (1.0 - momentum);
    } else if (volatility >= 0.6 && momentum < 0.4) {
      recState = "REDUCE";
      reasoning = "Asset displays weakening momentum with elevated volatility, recommending reducing exposure (crypto: no valuation signal available).";
      rulesMatched = { weakening_momentum_and_volatility: true };
      confidenceFactors = { volatility: 0.5, momentum: 0.5 };
      confidenceScore = 0.5 * volatility + 0.5 * (1.0 - momentum);
    } else {
      recState = "HOLD";
      reasoning = "Asset parameters remain within stable bounds. Recommending holding current position.";
      rulesMatched = { stable_parameters: true };
      confidenceFactors = { sentiment: 0.5, volatility: 0.5 };
      confidenceScore = 0.5 * sentiment + 0.5 * (1.0 - volatility);
    }
  } else {
    const quality = Number(scores.quality_score);
    const valuation = Number(scores.valuation_score);

    if (valuation >= 0.7 && momentum >= 0.5 && sentiment >= 0.5) {
      recState = "BUY";
      reasoning = "Asset displays strong underpricing combined with positive momentum and constructive market sentiment.";
      rulesMatched = { underpricing_and_momentum: true };
      confidenceFactors = { valuation: 0.4, momentum: 0.3, sentiment: 0.3 };
      confidenceScore = 0.4 * valuation + 0.3 * momentum + 0.3 * sentiment;
    } else if (sentiment < 0.3 && momentum < 0.4) {
      recState = "AVOID";
      reasoning = "Asset displays weak market sentiment and negative momentum, prompting caution.";
      rulesMatched = { weak_sentiment_and_momentum: true };
      confidenceFactors = { sentiment: 0.5, momentum: 0.5 };
      confidenceScore = 0.5 * (1.0 - sentiment) + 0.5 * (1.0 - momentum);
    } else if (valuation < 0.4 && volatility >= 0.6) {
      recState = "REDUCE";
      reasoning = "Asset is potentially overvalued with elevated volatility, recommending reducing exposure.";
      rulesMatched = { overvaluation_and_volatility: true };
      confidenceFactors = { valuation: 0.5, volatility: 0.5 };
      confidenceScore = 0.5 * (1.0 - valuation) + 0.5 * volatility;
    } else {
      recState = "HOLD";
      reasoning = "Asset parameters remain within stable bounds. Recommending holding current position.";
      rulesMatched = { stable_parameters: true };
      confidenceFactors = { quality: 0.5, volatility: 0.5 };
      confidenceScore = 0.5 * quality + 0.5 * (1.0 - volatility);
    }
  }

  const existingRec = await prisma.recommendations.findFirst({ where: { asset_id: assetId, version: "v2.0.0" } });
  const recId = existingRec?.id ?? uuidv4();
  const now = new Date();

  const rec = await prisma.recommendations.upsert({
    where: { id: recId },
    create: {
      id: recId,
      asset_id: assetId,
      recommendation_state: recState,
      confidence_score: confidenceScore,
      status: "active",
      version: "v2.0.0",
      created_at: now,
      updated_at: now,
    },
    update: {
      recommendation_state: recState,
      confidence_score: confidenceScore,
      updated_at: now,
    },
  });

  await prisma.recommendation_explanations.upsert({
    where: { recommendation_id: recId },
    create: {
      recommendation_id: recId,
      rules_matched: rulesMatched,
      reasoning,
      confidence_factors: confidenceFactors,
    },
    update: {
      rules_matched: rulesMatched,
      reasoning,
      confidence_factors: confidenceFactors,
    },
  });

  const existingOutcome = await prisma.recommendation_outcomes.findUnique({ where: { recommendation_id: recId } });
  if (!existingOutcome) {
    await prisma.recommendation_outcomes.create({
      data: { recommendation_id: recId, status: "active", action_taken_at: now },
    });
  }

  return rec;
}

/** Port of RecommendationRepository._held_asset_ids: distinct non-null
 * asset_ids held across every portfolio (this app is single-user/no-
 * multi-tenancy, so Recommendation stays asset-scoped rather than gaining a
 * portfolio_id column). */
async function heldAssetIds(): Promise<string[]> {
  const rows = await prisma.position.findMany({
    where: { assetId: { not: null } },
    select: { assetId: true },
    distinct: ["assetId"],
  });
  return rows.map((r) => r.assetId!).filter((id): id is string => id !== null);
}

/** Port of generate_recommendations — the manual batch trigger. Iterates
 * AssetSnapshot rows for assets actually held in a portfolio position,
 * skipping any without both AssetFeatures and an AssetScore row yet. */
export async function generateRecommendations(): Promise<SerializedRecommendation[]> {
  const assetIds = await heldAssetIds();
  const snapshots = assetIds.length > 0 ? await prisma.assetSnapshot.findMany({ where: { assetId: { in: assetIds } } }) : [];
  const recsCreated: Recommendation[] = [];

  for (const snap of snapshots) {
    const assetId = snap.assetId;
    const features = await prisma.asset_features.findUnique({ where: { asset_id: assetId } });
    const scores = await prisma.assetScore.findFirst({
      where: { assetId },
      orderBy: { generatedAt: "desc" },
    });

    if (!features || !scores) continue;

    const rec = await scoreAndMaterialize(assetId, features, {
      quality_score: scores.qualityScore,
      valuation_score: scores.valuationScore,
    });
    if (rec !== null) recsCreated.push(rec);
  }

  return Promise.all(recsCreated.map((r) => serializeRecommendation(r)));
}

import { prisma } from "../../prisma";

// Recency-weighted, confidence-shrunk aggregation. Each article's contribution
// decays with age (half-life below), and the aggregate is pulled toward
// neutral (0) when total evidence is thin, so one stale article doesn't carry
// the same signal as ten recent ones. Port of NewsSentimentService /
// _weighted_sentiment.
const HALF_LIFE_7D_DAYS = 2.0;
const HALF_LIFE_30D_DAYS = 7.0;
const CONFIDENCE_TARGET_WEIGHT = 5.0; // weight-equivalent of ~5 fresh articles saturates confidence
const TREND_THRESHOLD = 0.05;

export function weightedSentiment(rows: Array<[number, Date]>, now: Date, halfLifeDays: number): number | null {
  if (rows.length === 0) return null;
  let weightSum = 0;
  let weightedTotal = 0;
  for (const [score, publishedAt] of rows) {
    const ageDays = Math.max(0, (now.getTime() - publishedAt.getTime()) / 86_400_000);
    const weight = 0.5 ** (ageDays / halfLifeDays);
    weightSum += weight;
    weightedTotal += weight * score;
  }
  if (weightSum === 0) return null;
  const rawAvg = weightedTotal / weightSum;
  const confidence = Math.min(1.0, weightSum / CONFIDENCE_TARGET_WEIGHT);
  return rawAvg * confidence;
}

export interface AssetSentimentSnapshot {
  asset_id: string;
  snapshot_date: Date;
  avg_sentiment_7d: number | null;
  avg_sentiment_30d: number | null;
  article_count_7d: number;
  trend: "IMPROVING" | "DETERIORATING" | "STABLE" | null;
}

/** Port of NewsSentimentService.aggregate_asset_sentiment. Recomputes the
 * rolling 7d/30d sentiment aggregate for an asset from news.sentiment_score
 * (immutable per-article scores, set at ingestion). Does not touch
 * per-article sentiment itself.
 *
 * Unwired this phase — Python's only call site is generate_features (the
 * evaluation/features worker), which has no Node port yet. Exported ready
 * for that future phase to wire in, same as routing.ts's resolveQuoteProvider. */
export async function aggregateAssetSentiment(assetId: string): Promise<AssetSentimentSnapshot | null> {
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 86_400_000);
  const since7d = new Date(now.getTime() - 7 * 86_400_000);

  const rows30dRaw = await prisma.news.findMany({
    where: {
      news_assets: { some: { asset_id: assetId } },
      sentiment_score: { not: null },
      published_at: { gte: since30d },
    },
    select: { sentiment_score: true, published_at: true },
  });
  if (rows30dRaw.length === 0) return null;

  const rows30d: Array<[number, Date]> = rows30dRaw.map((r) => [r.sentiment_score as number, r.published_at as Date]);
  const rows7d = rows30d.filter(([, publishedAt]) => publishedAt >= since7d);

  const avg7d = weightedSentiment(rows7d, now, HALF_LIFE_7D_DAYS);
  const avg30d = weightedSentiment(rows30d, now, HALF_LIFE_30D_DAYS);

  let trend: AssetSentimentSnapshot["trend"] = null;
  if (avg7d !== null && avg30d !== null) {
    const diff = avg7d - avg30d;
    if (diff > TREND_THRESHOLD) trend = "IMPROVING";
    else if (diff < -TREND_THRESHOLD) trend = "DETERIORATING";
    else trend = "STABLE";
  }

  const snapshotDate = new Date(now);
  snapshotDate.setUTCHours(0, 0, 0, 0);

  const snapshot: AssetSentimentSnapshot = {
    asset_id: assetId,
    snapshot_date: snapshotDate,
    avg_sentiment_7d: avg7d,
    avg_sentiment_30d: avg30d,
    article_count_7d: rows7d.length,
    trend,
  };

  await prisma.asset_sentiment_snapshots.upsert({
    where: { asset_id_snapshot_date: { asset_id: assetId, snapshot_date: snapshotDate } },
    create: snapshot,
    update: {
      avg_sentiment_7d: snapshot.avg_sentiment_7d,
      avg_sentiment_30d: snapshot.avg_sentiment_30d,
      article_count_7d: snapshot.article_count_7d,
      trend: snapshot.trend,
    },
  });

  return snapshot;
}

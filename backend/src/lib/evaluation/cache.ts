import Redis from "ioredis";
import { logger } from "../logger";

// Same Redis instance/keys as Python's app/core/redis.py — every function
// here is a direct port of one of its cache_*/get_cached_*/invalidate_*
// pairs (asset-evaluation-chain tier + Phase 10B financial-intelligence
// tier), sharing the same key names/TTLs so either backend can read the
// other's writes.
const redis = new Redis(process.env.REDIS_URL!);
redis.on("error", (err) => logger.error({ err }, "evaluation cache: redis connection error"));

async function setJson(key: string, ttlSeconds: number, data: unknown): Promise<void> {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(data));
  } catch {
    // Matches Python's redis.RedisError swallow — caching is best-effort.
  }
}

async function getJson<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    if (data) return JSON.parse(data) as T;
  } catch {
    // Matches Python's redis.RedisError swallow.
  }
  return null;
}

export const getAssetSnapshotKey = (assetId: string): string => `market:snapshot:${assetId}`;
export const cacheAssetSnapshot = (assetId: string, data: unknown): Promise<void> => setJson(getAssetSnapshotKey(assetId), 300, data);
export const getCachedAssetSnapshot = <T>(assetId: string): Promise<T | null> => getJson<T>(getAssetSnapshotKey(assetId));

export const getAssetFeaturesKey = (assetId: string): string => `market:features:${assetId}`;
export const cacheAssetFeatures = (assetId: string, data: unknown): Promise<void> => setJson(getAssetFeaturesKey(assetId), 900, data);
export const getCachedAssetFeatures = <T>(assetId: string): Promise<T | null> => getJson<T>(getAssetFeaturesKey(assetId));

export const getAssetScoresKey = (assetId: string): string => `evaluation:scores:${assetId}`;
export const cacheAssetScores = (assetId: string, data: unknown): Promise<void> => setJson(getAssetScoresKey(assetId), 900, data);
export const getCachedAssetScores = <T>(assetId: string): Promise<T | null> => getJson<T>(getAssetScoresKey(assetId));

export const getAssetHealthKey = (assetId: string): string => `monitoring:asset-health:${assetId}`;
export const cacheAssetHealth = (assetId: string, data: unknown): Promise<void> => setJson(getAssetHealthKey(assetId), 300, data);
export const getCachedAssetHealth = <T>(assetId: string): Promise<T | null> => getJson<T>(getAssetHealthKey(assetId));

export const getAssetSignalsKey = (assetId: string): string => `market:signals:${assetId}`;
export const cacheAssetSignals = (assetId: string, data: unknown): Promise<void> => setJson(getAssetSignalsKey(assetId), 900, data);
export const getCachedAssetSignals = <T>(assetId: string): Promise<T | null> => getJson<T>(getAssetSignalsKey(assetId));

// RECOMMENDATIONS_CACHE_KEY in Python is the literal string "global" (single-
// tenant app, not a real org id) — kept as the same literal here.
const RECOMMENDATIONS_CACHE_KEY = "global";
export const getOrgRecommendationsKey = (orgId: string): string => `recommendation:org:${orgId}`;
export const invalidateOrgRecommendations = async (orgId: string = RECOMMENDATIONS_CACHE_KEY): Promise<void> => {
  try {
    await redis.del(getOrgRecommendationsKey(orgId));
  } catch {
    // Matches Python's redis.RedisError swallow.
  }
};

export const getIntelligenceDashboardKey = (orgId: string): string => `intelligence:dashboard:${orgId}`;
export const cacheIntelligenceDashboard = (orgId: string, data: unknown): Promise<void> => setJson(getIntelligenceDashboardKey(orgId), 900, data);

export const getIntelligencePortfolioKey = (portfolioId: string): string => `intelligence:portfolio:${portfolioId}`;
export const cacheIntelligencePortfolio = (portfolioId: string, data: unknown): Promise<void> => setJson(getIntelligencePortfolioKey(portfolioId), 900, data);

export const getIntelligenceHealthKey = (portfolioId: string): string => `intelligence:health:${portfolioId}`;
export const cacheIntelligenceHealth = (portfolioId: string, data: unknown): Promise<void> => setJson(getIntelligenceHealthKey(portfolioId), 900, data);

export const getIntelligenceRecommendationsKey = (portfolioId: string): string => `intelligence:recommendations:${portfolioId}`;
export const cacheIntelligenceRecommendations = (portfolioId: string, data: unknown): Promise<void> => setJson(getIntelligenceRecommendationsKey(portfolioId), 900, data);

export const getIntelligenceOutcomesKey = (portfolioId: string): string => `intelligence:outcomes:${portfolioId}`;
export const cacheIntelligenceOutcomes = (portfolioId: string, data: unknown): Promise<void> => setJson(getIntelligenceOutcomesKey(portfolioId), 900, data);

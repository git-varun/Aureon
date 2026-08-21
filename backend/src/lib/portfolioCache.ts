import Redis from "ioredis";
import { logger } from "./logger";

// Own client, same pattern as redisRateLimit.ts and queue.ts (each module
// constructs its own connection rather than sharing one) — this module owns
// portfolio-aggregate invalidation, distinct from that file's market-data
// rate-limit/quote-cache concerns.
const redis = new Redis(process.env.REDIS_URL!);
redis.on("error", (err) => logger.error({ err }, "portfolioCache: redis connection error"));

// Same key patterns as Python's app/core/redis.py — these must match exactly
// since Node's writes need to invalidate the SAME keys Python's read path
// (get_cached_portfolio_snapshot / get_cached_intelligence_*) checks.
function getPortfolioSnapshotKey(portfolioId: string): string {
  return `portfolio:snapshot:${portfolioId}`;
}

function getIntelligencePortfolioKey(portfolioId: string): string {
  return `intelligence:portfolio:${portfolioId}`;
}

function getIntelligenceHealthKey(portfolioId: string): string {
  return `intelligence:health:${portfolioId}`;
}

function getIntelligenceRecommendationsKey(portfolioId: string): string {
  return `intelligence:recommendations:${portfolioId}`;
}

function getIntelligenceOutcomesKey(portfolioId: string): string {
  return `intelligence:outcomes:${portfolioId}`;
}

// Matches Python's RECOMMENDATIONS_CACHE_KEY = "global" in
// app/modules/ai/services/recommendation.py — recommendations are global,
// not portfolio-scoped, so there's a single fixed cache key.
function getOrgRecommendationsKey(orgId: string): string {
  return `recommendation:org:${orgId}`;
}

/** Port of app/core/redis.py cache_portfolio_snapshot. Same key/900s TTL as
 * Python so a Node-written entry can be read by Python (and vice versa)
 * during a partial rollout or rollback. */
export async function cachePortfolioSnapshot(portfolioId: string, snapshotData: Record<string, unknown>): Promise<void> {
  try {
    await redis.setex(getPortfolioSnapshotKey(portfolioId), 900, JSON.stringify(snapshotData));
  } catch (e) {
    logger.warn({ operation: "cache_portfolio_snapshot", portfolioId, err: e }, "redis_operation_failed");
  }
}

/** Port of app/core/redis.py get_cached_portfolio_snapshot. */
export async function getCachedPortfolioSnapshot(portfolioId: string): Promise<Record<string, unknown> | null> {
  try {
    const data = await redis.get(getPortfolioSnapshotKey(portfolioId));
    if (data) {
      const result = JSON.parse(data);
      if (result && typeof result === "object") return result as Record<string, unknown>;
    }
  } catch (e) {
    logger.warn({ operation: "get_cached_portfolio_snapshot", portfolioId, err: e }, "redis_operation_failed");
  }
  return null;
}

/** Port of PortfolioService._invalidate_portfolio_caches. Swallows Redis
 * errors (matching Python's redis.RedisError catch-and-warn) — a cache
 * invalidation failure must never fail a write that already committed to
 * Postgres. */
export async function invalidatePortfolioCaches(portfolioId: string): Promise<void> {
  try {
    await redis.del(
      getPortfolioSnapshotKey(portfolioId),
      getIntelligencePortfolioKey(portfolioId),
      getIntelligenceHealthKey(portfolioId),
    );
  } catch (e) {
    logger.warn({ operation: "invalidate_portfolio_caches", portfolioId, err: e }, "redis_operation_failed");
  }
}

/** Port of Python's invalidate_intelligence_recommendations (app/core/redis.py). */
export async function invalidateIntelligenceRecommendations(portfolioId: string): Promise<void> {
  try {
    await redis.del(getIntelligenceRecommendationsKey(portfolioId));
  } catch (e) {
    logger.warn({ operation: "invalidate_intelligence_recommendations", portfolioId, err: e }, "redis_operation_failed");
  }
}

/** Port of Python's invalidate_intelligence_outcomes (app/core/redis.py). */
export async function invalidateIntelligenceOutcomes(portfolioId: string): Promise<void> {
  try {
    await redis.del(getIntelligenceOutcomesKey(portfolioId));
  } catch (e) {
    logger.warn({ operation: "invalidate_intelligence_outcomes", portfolioId, err: e }, "redis_operation_failed");
  }
}

/** Port of Python's invalidate_org_recommendations (app/core/redis.py),
 * called by apply_recommendation/dismiss_recommendation/undo_recommendation
 * after each write. Those call sites also call
 * updateFinancialIntelligencePipeline (lib/ai/intelligence.ts, Task 8,
 * migration plan) right after this invalidation, matching Python. */
export async function invalidateOrgRecommendations(orgId: string): Promise<void> {
  try {
    await redis.del(getOrgRecommendationsKey(orgId));
  } catch (e) {
    logger.warn({ operation: "invalidate_org_recommendations", orgId, err: e }, "redis_operation_failed");
  }
}

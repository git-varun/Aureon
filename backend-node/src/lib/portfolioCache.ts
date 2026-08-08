import Redis from "ioredis";

// Own client, same pattern as redisRateLimit.ts and queue.ts (each module
// constructs its own connection rather than sharing one) — this module owns
// portfolio-aggregate invalidation, distinct from that file's market-data
// rate-limit/quote-cache concerns.
const redis = new Redis(process.env.REDIS_URL!);

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
    console.warn(`redis_operation_failed operation=invalidate_portfolio_caches portfolio_id=${portfolioId} error=${(e as Error).message}`);
  }
}

/** Port of Python's invalidate_intelligence_recommendations (app/core/redis.py). */
export async function invalidateIntelligenceRecommendations(portfolioId: string): Promise<void> {
  try {
    await redis.del(getIntelligenceRecommendationsKey(portfolioId));
  } catch (e) {
    console.warn(`redis_operation_failed operation=invalidate_intelligence_recommendations portfolio_id=${portfolioId} error=${(e as Error).message}`);
  }
}

/** Port of Python's invalidate_intelligence_outcomes (app/core/redis.py). */
export async function invalidateIntelligenceOutcomes(portfolioId: string): Promise<void> {
  try {
    await redis.del(getIntelligenceOutcomesKey(portfolioId));
  } catch (e) {
    console.warn(`redis_operation_failed operation=invalidate_intelligence_outcomes portfolio_id=${portfolioId} error=${(e as Error).message}`);
  }
}

import Redis from "ioredis";

// Same Redis instance/keys as the Python backend's app/core/redis.py — the
// budget/cooldown counters are deliberately shared across both backends
// (that's what stops either one from drawing a real 429, not a per-backend
// concern) and market:quote:* is the same cache the Python read path checks.
const redis = new Redis(process.env.REDIS_URL!);

export function getProviderBudgetKey(providerName: string, windowSeconds: number): string {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  return `provider_budget:${providerName}:${windowSeconds}:${bucket}`;
}

/** Port of try_consume_provider_budget. Fixed-window (INCR+EXPIRE) counter —
 * good enough for "stay under X calls per window", not exact-to-the-second.
 * No error swallowing: a Redis outage surfaces as a thrown error, same as
 * any other provider-unavailable failure, rather than letting every call
 * through unmetered. */
export async function tryConsumeProviderBudget(
  providerName: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const key = getProviderBudgetKey(providerName, windowSeconds);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return count <= limit;
}

export function getProviderCooldownKey(providerName: string): string {
  return `provider_cooldown:${providerName}`;
}

/** Port of set_provider_cooldown — explicit cooldown set from a real 429's
 * Retry-After header, honoring the provider's actual relative cooldown
 * (unlike tryConsumeProviderBudget's fixed wall-clock window). */
export async function setProviderCooldown(providerName: string, seconds: number): Promise<void> {
  await redis.set(getProviderCooldownKey(providerName), "1", "EX", Math.max(seconds, 1));
}

export async function isProviderCoolingDown(providerName: string): Promise<boolean> {
  const exists = await redis.exists(getProviderCooldownKey(providerName));
  return exists === 1;
}

export function getQuoteCacheKey(symbol: string): string {
  return `market:quote:${symbol.toUpperCase().trim()}`;
}

/** TTL-only cache (60s) — nothing invalidates this key on write from
 * elsewhere (a broker-sync price write, a manual correction, etc.), so a
 * stale quote can be served for up to 60s after such a write. Matches
 * Python's behavior; flagged here as a known gap, not fixed in this phase. */
export async function cacheQuote(symbol: string, quoteData: Record<string, unknown>): Promise<void> {
  try {
    await redis.setex(getQuoteCacheKey(symbol), 60, JSON.stringify(quoteData));
  } catch {
    // Matches Python's redis.RedisError swallow — caching is best-effort.
  }
}

export async function getCachedQuote(symbol: string): Promise<Record<string, unknown> | null> {
  try {
    const data = await redis.get(getQuoteCacheKey(symbol));
    if (data) {
      const result = JSON.parse(data);
      if (result && typeof result === "object" && !Array.isArray(result)) return result;
    }
  } catch {
    // Matches Python's redis.RedisError swallow.
  }
  return null;
}

const RESET_LOCK_KEY = "reset:in_progress";

/** Port of is_reset_in_progress — checked by wrapJobExecution at the top of
 * every ingestion job, guarding against a job writing rows mid data-reset.
 * Same Redis key as Python's core/redis.py, since this must be shared. */
export async function isResetInProgress(): Promise<boolean> {
  try {
    return (await redis.exists(RESET_LOCK_KEY)) === 1;
  } catch {
    // Matches Python's redis.RedisError swallow.
    return false;
  }
}

function getAssetSnapshotKey(assetId: string): string {
  return `market:snapshot:${assetId}`;
}

/** Port of get_cached_asset_snapshot. Nothing in this backend writes this
 * key yet (cache_asset_snapshot's writer, the feature/scoring pipeline,
 * isn't ported) — reads are always a cache miss today and fall through to
 * the DB, same net effect as Python when that pipeline hasn't run. */
export async function getCachedAssetSnapshot(assetId: string): Promise<Record<string, unknown> | null> {
  try {
    const data = await redis.get(getAssetSnapshotKey(assetId));
    if (data) {
      const result = JSON.parse(data);
      if (result && typeof result === "object" && !Array.isArray(result)) return result;
    }
  } catch {
    // Matches Python's redis.RedisError swallow.
  }
  return null;
}

function getAssetFeaturesKey(assetId: string): string {
  return `market:features:${assetId}`;
}

/** Port of get_cached_asset_features. Same not-yet-written-to caveat as
 * getCachedAssetSnapshot above. */
export async function getCachedAssetFeatures(assetId: string): Promise<Record<string, unknown> | null> {
  try {
    const data = await redis.get(getAssetFeaturesKey(assetId));
    if (data) {
      const result = JSON.parse(data);
      if (result && typeof result === "object" && !Array.isArray(result)) return result;
    }
  } catch {
    // Matches Python's redis.RedisError swallow.
  }
  return null;
}

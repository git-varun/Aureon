import Redis from "ioredis";
import { logger } from "../logger";

// Own client, same pattern as redisRateLimit.ts/queue.ts. Port of
// app/core/providers/retry.py's CircuitBreaker — per-key cooldown tracker,
// Redis-backed with an in-memory fallback so it still works if Redis is
// briefly unavailable.
const redis = new Redis(process.env.REDIS_URL!);
redis.on("error", (err) => logger.error({ err }, "circuitBreaker: redis connection error"));

export class CircuitBreaker {
  private namespace: string;
  private cooldowns = new Map<string, number>();

  constructor(namespace = "provider") {
    this.namespace = namespace;
  }

  private redisKey(key: string): string {
    return `${this.namespace}:cooldown:${key}`;
  }

  async trip(key: string, seconds: number): Promise<void> {
    try {
      await redis.set(this.redisKey(key), "1", "EX", Math.max(1, Math.round(seconds)));
      return;
    } catch {
      // Redis unavailable — fall back to memory.
    }
    this.cooldowns.set(key, Date.now() + seconds * 1000);
  }

  async isOpen(key: string): Promise<boolean> {
    try {
      if ((await redis.get(this.redisKey(key))) !== null) return true;
    } catch {
      // Redis unavailable — fall back to memory.
    }
    const expiry = this.cooldowns.get(key);
    if (expiry === undefined) return false;
    if (Date.now() >= expiry) {
      this.cooldowns.delete(key);
      return false;
    }
    return true;
  }

  /** Clear every cooled-down entry whose key starts with `${prefix}:` (e.g.
   * all models of one provider). Used when an operator rotates a provider's
   * credential — a freshly-fixed key should recover immediately, not wait
   * out the remaining TTL. Additive: the trip/isOpen backstop is unchanged. */
  async clearByPrefix(prefix: string): Promise<number> {
    let cleared = 0;
    try {
      const keys = await redis.keys(this.redisKey(`${prefix}:*`));
      if (keys.length > 0) cleared += await redis.del(...keys);
    } catch {
      // Redis unavailable — fall through to the memory map.
    }
    for (const k of [...this.cooldowns.keys()]) {
      if (k.startsWith(`${prefix}:`)) {
        this.cooldowns.delete(k);
        cleared++;
      }
    }
    return cleared;
  }
}

export const aiCircuitBreaker = new CircuitBreaker("ai");

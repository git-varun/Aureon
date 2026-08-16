import Redis from "ioredis";

// Own client, same pattern as redisRateLimit.ts/queue.ts. Port of
// app/core/providers/retry.py's CircuitBreaker — per-key cooldown tracker,
// Redis-backed with an in-memory fallback so it still works if Redis is
// briefly unavailable.
const redis = new Redis(process.env.REDIS_URL!);

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
}

export const aiCircuitBreaker = new CircuitBreaker("ai");

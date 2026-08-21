import Redis from "ioredis";
import { logger } from "../logger";

const redis = new Redis(process.env.REDIS_URL!);
redis.on("error", (err) => logger.error({ err }, "resetRedis: redis connection error"));

const RESET_LOCK_KEY = "reset:in_progress";

/** Port of try_acquire_reset_lock — no error swallowing, a Redis outage must
 * surface rather than silently let a reset proceed unguarded. */
export async function tryAcquireResetLock(token: string, ttlSeconds: number): Promise<boolean> {
  const result = await redis.set(RESET_LOCK_KEY, token, "EX", ttlSeconds, "NX");
  return result === "OK";
}

/** Port of release_reset_lock — compare-then-delete. */
export async function releaseResetLock(token: string): Promise<void> {
  const current = await redis.get(RESET_LOCK_KEY);
  if (current === token) await redis.del(RESET_LOCK_KEY);
}

function backupReceiptKey(): string {
  return "backup:receipt";
}

/** Port of store_backup_receipt — best-effort, swallows Redis errors like
 * Python's version (export succeeding matters more than the receipt write). */
export async function storeBackupReceipt(receipt: string, ttlSeconds = 600): Promise<void> {
  try {
    await redis.set(backupReceiptKey(), receipt, "EX", ttlSeconds);
  } catch (e) {
    logger.warn({ operation: "store_backup_receipt", err: e }, "redis_operation_failed");
  }
}

/** Port of consume_backup_receipt — single-use GET-compare-then-DELETE. */
export async function consumeBackupReceipt(receipt: string): Promise<boolean> {
  const current = await redis.get(backupReceiptKey());
  if (current === receipt) {
    await redis.del(backupReceiptKey());
    return true;
  }
  return false;
}

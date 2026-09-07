import { generateFeatures } from "./generateFeatures";
import { logger } from "../lib/logger";

// Bounds how many generateFeatures(assetId) calls run concurrently. Python's
// generate_features.delay(str(aid)) loop is queue-bounded by Celery worker
// concurrency (durable, retryable); Node has no per-job queue this phase
// (see plan Global Constraints — no BullMQ queue-per-job), so an earlier
// version of this function fired every call as an unawaited promise all at
// once — up to 564 concurrent generateFeatures runs for a full-universe
// reprocess, each doing several Prisma round-trips, against a Prisma
// connection pool that defaults to a small multiple of CPU count. This is a
// plain bounded-batch loop, nothing more (no durability across a process
// restart, no retry-on-failure). The full-universe callers
// (admin_reprocess_all / admin_repair) were retired 2026-09-07; the bound
// stays because adminBackfillAssets still routes through here.
const FAN_OUT_BATCH_SIZE = 10;

/** Processes assetIds in fixed-size batches, awaiting each batch (via
 * Promise.allSettled, so one bad asset can't take down the batch or abort
 * the remaining ones) before starting the next — bounds concurrent
 * generateFeatures() calls to FAN_OUT_BATCH_SIZE regardless of how large
 * assetIds is, so behavior no longer depends on Prisma connection-pool
 * size at full-universe scale. Awaited by its caller (unlike the earlier
 * fire-and-forget version), so the job's JobLog reflects when processing
 * actually finished, not just when it was kicked off. */
async function fanOutGenerateFeatures(assetIds: string[]): Promise<void> {
  for (let i = 0; i < assetIds.length; i += FAN_OUT_BATCH_SIZE) {
    const batch = assetIds.slice(i, i + FAN_OUT_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((assetId) => generateFeatures(assetId)));
    results.forEach((result, idx) => {
      if (result.status === "rejected") {
        const assetId = batch[idx];
        const e = result.reason as Error;
        logger.error({ job: "admin_backfill_assets", assetId, err: e }, "generateFeatures failed");
      }
    });
  }
}

/** Port of admin_backfill_assets. Unlike every other job ported in this
 * plan, Python's task takes `asset_ids: list[str]` directly — no `log_id`,
 * no `_wrap_job_execution` wrapper, no JobLog row at all. It structurally
 * cannot fit `JOB_RUNNERS`'s `(logId) => Promise<void>` shape, so it is
 * NOT added there — its only real call site is
 * `POST /market/symbols/{symbol}/backfill`
 * (backend/src/routes/market/market.ts's `triggerBackfill`), which
 * resolves one asset by symbol and calls `adminBackfillAssets([asset.id])`
 * without awaiting it. It stays fire-and-forget at this outer layer (no
 * JobLog to close out, matching Python's own no-`_wrap_job_execution`
 * shape) while `fanOutGenerateFeatures` still bounds concurrency
 * internally. */
export function adminBackfillAssets(assetIds: string[]): void {
  void fanOutGenerateFeatures(assetIds).catch((e: Error) => {
    logger.error({ job: "admin_backfill_assets", err: e }, "fan-out failed");
  });
}

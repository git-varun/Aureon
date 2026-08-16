import { prisma } from "../prisma";
import { generateFeatures } from "./generateFeatures";
import { wrapJobExecution } from "../lib/jobs/wrapJobExecution";

// Bounds how many generateFeatures(assetId) calls run concurrently. Python's
// generate_features.delay(str(aid)) loop is queue-bounded by Celery worker
// concurrency (durable, retryable); Node has no per-job queue this phase
// (see plan Global Constraints — no BullMQ queue-per-job), so an earlier
// version of this function fired every call as an unawaited promise all at
// once — up to 564 concurrent generateFeatures runs for admin_reprocess_all,
// each doing several Prisma round-trips, against a Prisma connection pool
// that defaults to a small multiple of CPU count. That does NOT match
// Celery's dispatch semantics (no bound, no durability across a process
// restart, no retry-on-failure) despite an earlier version of this comment
// claiming it did — this is a plain bounded-batch loop, nothing more.
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
        console.error(`admin maintenance: generateFeatures failed for asset ${assetId}: ${e.message}`);
      }
    });
  }
}

/** Port of admin_reprocess_all_assets (job_name "admin_reprocess_all", per
 * _wrap_job_execution's wrap-name argument — the JobConfig-driven dispatch
 * name differs from the Celery task's own name). No JobConfig row exists for
 * this job in Python's _DEFAULT_JOBS (nor seeded in Node) — same as Python,
 * it has no beat_schedule entry and is unreachable through the
 * job_configs-gated `POST /jobs/{job_name}/run` route in either backend;
 * it's reachable only via a direct dispatch_job("admin_reprocess_all") call
 * from wherever a caller invokes it (no such caller exists in this repo
 * today — confirmed via grep, both backends). Still wired into JOB_RUNNERS
 * for parity/dispatchJob-bypass callers, per the brief. */
async function reprocessAllAssets(): Promise<void> {
  const rows = await prisma.latestQuote.findMany({ where: { assetId: { not: null } }, select: { assetId: true }, distinct: ["assetId"] });
  const assetIds = rows.map((r) => r.assetId).filter((id): id is string => id !== null);
  await fanOutGenerateFeatures(assetIds);
}

export async function adminReprocessAllAssetsTask(logId: number | null = null): Promise<void> {
  await wrapJobExecution("admin_reprocess_all", logId, reprocessAllAssets);
}

/** Port of admin_backfill_assets. Unlike every other job ported in this
 * plan, Python's task takes `asset_ids: list[str]` directly — no `log_id`,
 * no `_wrap_job_execution` wrapper, no JobLog row at all. It structurally
 * cannot fit `JOB_RUNNERS`'s `(logId) => Promise<void>` shape, so it is
 * NOT added there — its only real call site is
 * `POST /market/symbols/{symbol}/backfill`
 * (backend/src/routes/market/market.ts's `triggerBackfill`), which
 * resolves one asset by symbol and calls `adminBackfillAssets([asset.id])`
 * without awaiting it. The route itself was deferred from Task 1 (no Node
 * generate_features runner existed yet) through Task 7 (out of that task's
 * jobs/tasks.py-only scope) and was finally ported in Task 10, as part of
 * deleting backend/ entirely — this function existed as a ready runner
 * before the route did. It stays fire-and-forget at this outer layer (no
 * JobLog to close out, matching Python's own no-`_wrap_job_execution`
 * shape) while `fanOutGenerateFeatures` still bounds concurrency
 * internally. */
export function adminBackfillAssets(assetIds: string[]): void {
  void fanOutGenerateFeatures(assetIds).catch((e: Error) => {
    console.error(`admin_backfill_assets: fan-out failed: ${e.message}`);
  });
}

/** Port of admin_repair_jobs (job_name "admin_repair"). Finds every
 * AssetSnapshot missing AssetFeatures or an AssetScore(model_version=v1.0.0)
 * row and re-fans-out generate_features for each — same no-JobConfig-row,
 * no-beat_schedule, no-current-caller situation as admin_reprocess_all
 * above. */
async function repairJobs(): Promise<void> {
  const modelVersion = "v1.0.0";
  const snapshots = await prisma.assetSnapshot.findMany({ select: { assetId: true } });
  const missing: string[] = [];
  for (const { assetId } of snapshots) {
    const [features, score] = await Promise.all([
      prisma.asset_features.findUnique({ where: { asset_id: assetId } }),
      prisma.assetScore.findFirst({ where: { assetId, modelVersion } }),
    ]);
    if (!features || !score) missing.push(assetId);
  }
  await fanOutGenerateFeatures(missing);
}

export async function adminRepairJobsTask(logId: number | null = null): Promise<void> {
  await wrapJobExecution("admin_repair", logId, repairJobs);
}

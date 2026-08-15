import { prisma } from "../prisma";
import { generateFeatures } from "./generateFeatures";
import { wrapJobExecution } from "../lib/jobs/wrapJobExecution";

/** Fire-and-forget fan-out matching Python's generate_features.delay(str(aid))
 * loop — Celery dispatches each asset onto q_ingestion and returns
 * immediately; Node has no per-job queue for this phase (see plan Global
 * Constraints — no BullMQ queue-per-job), so each call is invoked directly
 * and NOT awaited, keeping the same "fire many, don't block the caller on
 * all of them" semantics. A rejected promise is logged, not thrown, so one
 * bad asset can't take down the batch. */
function fanOutGenerateFeatures(assetIds: string[]): void {
  for (const assetId of assetIds) {
    generateFeatures(assetId).catch((e: Error) => {
      console.error(`admin maintenance: generateFeatures failed for asset ${assetId}: ${e.message}`);
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
  fanOutGenerateFeatures(assetIds);
}

export async function adminReprocessAllAssetsTask(logId: number | null = null): Promise<void> {
  await wrapJobExecution("admin_reprocess_all", logId, reprocessAllAssets);
}

/** Port of admin_backfill_assets. Unlike every other job ported in this
 * plan, Python's task takes `asset_ids: list[str]` directly — no `log_id`,
 * no `_wrap_job_execution` wrapper, no JobLog row at all. It structurally
 * cannot fit `JOB_RUNNERS`'s `(logId) => Promise<void>` shape, so it is
 * NOT added there — its only real Python call site is
 * `POST /market/symbols/{symbol}/backfill` (market.py:142), which resolves
 * one asset by symbol and calls `admin_backfill_assets.delay([str(asset.id)])`.
 * That route is deliberately not ported to Node yet (Task 1 explicitly
 * deferred it — see task1-report.md — because generate_features had no
 * Node runner at the time; it does now, but porting the route itself is
 * out of Task 7's scope, which is jobs/tasks.py only). This function exists
 * so a future route port has a ready runner to call. */
export function adminBackfillAssets(assetIds: string[]): void {
  fanOutGenerateFeatures(assetIds);
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
  fanOutGenerateFeatures(missing);
}

export async function adminRepairJobsTask(logId: number | null = null): Promise<void> {
  await wrapJobExecution("admin_repair", logId, repairJobs);
}

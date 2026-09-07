import { sweepStaleRunningJobs } from "../lib/jobs/config";
import { pruneProviderUsage } from "../lib/jobs/ingestionRepo";
import { wrapJobExecution } from "../lib/jobs/wrapJobExecution";
import { logger } from "../lib/logger";

// Generous enough to outlast the slowest real job with comfortable margin,
// so this never marks a merely-slow job as crashed. Matches Python's
// _STALE_JOB_TIMEOUT_SECONDS.
const STALE_JOB_TIMEOUT_SECONDS = 2 * 60 * 60;

// provider_usage retention (BUG-S). Zero readers today, so any window is
// safe; 90 days keeps a full quarter for the one plausible future reader (a
// provider cost/usage view) at a trivial row ceiling (~40k at current rate).
const PROVIDER_USAGE_RETENTION_DAYS = 90;

async function sweep(): Promise<{ swept: number; providerUsagePruned: number }> {
  const swept = await sweepStaleRunningJobs(STALE_JOB_TIMEOUT_SECONDS);
  if (swept > 0) {
    logger.warn({ job: "sweep_stale_job_logs", swept }, "marked stale RUNNING job_logs row(s) as FAILED");
  }

  // Runs after the zombie sweep and cannot fail the job: this task is the
  // only thing closing out crashed RUNNING rows (boot + */30 cron), so a
  // prune error must log and move on, not mark the whole sweep FAILED.
  let providerUsagePruned = 0;
  try {
    providerUsagePruned = await pruneProviderUsage(PROVIDER_USAGE_RETENTION_DAYS);
    if (providerUsagePruned > 0) {
      logger.info({ job: "sweep_stale_job_logs", providerUsagePruned }, "pruned old provider_usage row(s)");
    }
  } catch (e) {
    logger.error({ job: "sweep_stale_job_logs", err: e }, "provider_usage prune failed — stale-job sweep still applied");
  }

  return { swept, providerUsagePruned };
}

/** Port of sweep_stale_job_logs_task — the zombie-RUNNING-job sweep, plus a
 * provider_usage retention prune folded in (BUG-S). No @_skip_if_disabled in
 * Python (this task has no beat_schedule-gated enabled/disabled semantics
 * the same way the other four do — it's always meant to run), so this port
 * doesn't call skipIfDisabled either. */
export async function sweepStaleJobLogsTask(logId: number | null = null): Promise<void> {
  await wrapJobExecution("sweep_stale_job_logs", logId, sweep);
}

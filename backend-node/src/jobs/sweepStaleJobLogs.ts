import { sweepStaleRunningJobs } from "../lib/jobs/config";
import { wrapJobExecution } from "../lib/jobs/wrapJobExecution";

// Generous enough to outlast the slowest real job with comfortable margin,
// so this never marks a merely-slow job as crashed. Matches Python's
// _STALE_JOB_TIMEOUT_SECONDS.
const STALE_JOB_TIMEOUT_SECONDS = 2 * 60 * 60;

async function sweep(): Promise<{ swept: number }> {
  const swept = await sweepStaleRunningJobs(STALE_JOB_TIMEOUT_SECONDS);
  if (swept > 0) {
    console.warn(`sweep_stale_job_logs: marked ${swept} stale RUNNING job_logs row(s) as FAILED`);
  }
  return { swept };
}

/** Port of sweep_stale_job_logs_task — the zombie-RUNNING-job sweep. No
 * @_skip_if_disabled in Python (this task has no beat_schedule-gated
 * enabled/disabled semantics the same way the other four do — it's always
 * meant to run), so this port doesn't call skipIfDisabled either. */
export async function sweepStaleJobLogsTask(logId: number | null = null): Promise<void> {
  await wrapJobExecution("sweep_stale_job_logs", logId, sweep);
}

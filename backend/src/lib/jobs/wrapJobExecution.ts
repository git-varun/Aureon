import { getJob, markJobRan, logJobStart, logJobEnd } from "./config";
import { isResetInProgress } from "../marketProviders/redisRateLimit";

/** Port of _wrap_job_execution. Every scheduled job goes through this —
 * reset-in-progress guard, JobLog lifecycle (create-if-absent, always closed
 * out), and the single last_run_at write site. No job-lock release here:
 * Python's release_job_lock only ever guards the three broker-sync jobs,
 * none of which are in scope this phase. */
export async function wrapJobExecution<T>(
  jobName: string,
  logId: number | null,
  fn: () => Promise<T>,
): Promise<void> {
  if (await isResetInProgress()) {
    console.warn(`Job ${jobName} skipped — data reset in progress`);
    return;
  }

  let resolvedLogId = logId;
  if (resolvedLogId === null) {
    const log = await logJobStart(jobName);
    resolvedLogId = log.id;
  }

  await markJobRan(jobName);

  try {
    const result = await fn();
    const resultRecord = result && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, unknown>) : null;
    await logJobEnd(resolvedLogId, "SUCCESS", { result: resultRecord });
  } catch (e) {
    await logJobEnd(resolvedLogId, "FAILED", { error: (e as Error).message });
    throw e;
  }
}

/** Port of _skip_if_disabled. Only meaningful for jobs with a real schedule
 * entry (this phase registers no BullMQ repeatable schedule at all — see the
 * concurrent-writer decision in the Phase 3 report — so today this only
 * gates the manual trigger scripts). */
export async function skipIfDisabled(jobName: string, logId: number | null): Promise<boolean> {
  const job = await getJob(jobName);
  if (job !== null && !job.enabled) {
    console.info(`${jobName}: skipped — JobConfig.enabled is False`);
    if (logId !== null) {
      await logJobEnd(logId, "SUCCESS", { error: "skipped — JobConfig.enabled is False" });
    }
    return true;
  }
  return false;
}

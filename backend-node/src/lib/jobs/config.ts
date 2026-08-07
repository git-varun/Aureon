import { prisma } from "../../prisma";
import { Prisma } from "../../generated/prisma";
import type { JobConfig, JobLog } from "../../generated/prisma";

/** Port of ConfigService.get_job. */
export async function getJob(jobName: string): Promise<JobConfig | null> {
  return prisma.jobConfig.findUnique({ where: { jobName } });
}

/** Port of ConfigService.mark_job_ran — single source of truth for
 * JobConfig.last_run_at, called by wrapJobExecution on every execution path
 * (beat-fired or manually dispatched), mirroring Python's own comment on why
 * this must not be a manual-dispatch-only call. */
export async function markJobRan(jobName: string): Promise<void> {
  await prisma.jobConfig.updateMany({ where: { jobName }, data: { lastRunAt: new Date() } });
}

/** Port of ConfigService.log_job_start. */
export async function logJobStart(jobName: string, taskId?: string | null): Promise<JobLog> {
  return prisma.jobLog.create({
    data: { jobName, status: "RUNNING", taskId: taskId ?? null },
  });
}

/** Port of ConfigService.log_job_end. duration_ms is computed the same way
 * Python does — ended_at minus started_at, in whole milliseconds. */
export async function logJobEnd(
  logId: number,
  status: "SUCCESS" | "FAILED",
  options: { error?: string | null; result?: Record<string, unknown> | null } = {},
): Promise<void> {
  const log = await prisma.jobLog.findUnique({ where: { id: logId } });
  if (!log) return;
  const endedAt = new Date();
  const durationMs = log.startedAt ? endedAt.getTime() - log.startedAt.getTime() : null;
  await prisma.jobLog.update({
    where: { id: logId },
    data: {
      status,
      errorMessage: options.error ?? null,
      resultSummary: (options.result as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      endedAt,
      durationMs,
    },
  });
}

/** Port of ConfigService.sweep_stale_running_jobs — marks RUNNING job_logs
 * rows older than timeoutSeconds as FAILED (a worker crash/kill mid-task
 * never reaches logJobEnd's finally block, so the row would otherwise stay
 * RUNNING forever). Returns the number of rows marked. */
export async function sweepStaleRunningJobs(timeoutSeconds: number): Promise<number> {
  const cutoff = new Date(Date.now() - timeoutSeconds * 1000);
  const stale = await prisma.jobLog.findMany({ where: { status: "RUNNING", startedAt: { lt: cutoff } } });
  if (stale.length === 0) return 0;

  const now = new Date();
  await prisma.$transaction(
    stale.map((log) =>
      prisma.jobLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          errorMessage: `Marked FAILED by stale-job sweep — still RUNNING after ${timeoutSeconds}s with no completion (worker likely crashed or was restarted mid-task)`,
          endedAt: now,
          durationMs: log.startedAt ? now.getTime() - log.startedAt.getTime() : null,
        },
      }),
    ),
  );
  return stale.length;
}

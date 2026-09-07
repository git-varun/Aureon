import { prisma } from "../../prisma";

/** Registry of jobs with a live BullMQ repeatable schedule (queue.ts /
 * registerSweepStaleJobLogsSchedule and friends) — add an entry here in the
 * SAME change that cuts a new job over from Python's beat_schedule (see
 * migration plan Task 3, Step 0). intervalMinutes must match the cron
 * pattern's actual cadence exactly, not be a rough estimate. Conversely,
 * drop the entry in the SAME change a job loses its repeatable schedule —
 * seed_price_history was here until it was demoted to manual-only on
 * 2026-09-07 (queue.ts / unregisterSeedPriceHistorySchedule), which would
 * otherwise leave this reporting a permanent false "stale" for a job that
 * no longer runs on a schedule. */
const SCHEDULED_JOBS: Array<{ jobName: string; intervalMinutes: number }> = [
  { jobName: "sweep_stale_job_logs", intervalMinutes: 30 },
  { jobName: "refresh_tracked_universe", intervalMinutes: 24 * 60 },
  { jobName: "refresh_mutual_fund_navs", intervalMinutes: 24 * 60 },
  { jobName: "refresh_prices", intervalMinutes: 60 },
];

/** Multiplier applied to intervalMinutes to decide "stale". 1.5x gives room
 * for a job that's merely running a bit long or slightly late without
 * false-alarming, while still catching the missed-cycle gap this exists to
 * catch (confirmed live: upsertJobScheduler skipped two full cycles — an
 * ~88min gap on a 30min schedule — after a worker restart against warm
 * Redis state; see taskforcesh/bullmq#3048, #3197, #3381, #3430, #2466). */
const STALENESS_MULTIPLIER = 1.5;

export interface ScheduledJobHealth {
  job_name: string;
  status: "healthy" | "stale" | "never_run";
  minutes_since_last_success: number | null;
  expected_interval_minutes: number;
}

/** Real check against config.job_logs — no synthetic/assumed-healthy
 * fallback. A job that has never recorded a SUCCESS row reports
 * "never_run", not "healthy". */
export async function getScheduledJobHealth(): Promise<ScheduledJobHealth[]> {
  const results: ScheduledJobHealth[] = [];

  for (const { jobName, intervalMinutes } of SCHEDULED_JOBS) {
    const lastSuccess = await prisma.jobLog.findFirst({
      where: { jobName, status: "SUCCESS" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });

    if (!lastSuccess) {
      results.push({
        job_name: jobName,
        status: "never_run",
        minutes_since_last_success: null,
        expected_interval_minutes: intervalMinutes,
      });
      continue;
    }

    const minutesSince = (Date.now() - lastSuccess.startedAt.getTime()) / 60_000;
    const staleThreshold = intervalMinutes * STALENESS_MULTIPLIER;

    results.push({
      job_name: jobName,
      status: minutesSince > staleThreshold ? "stale" : "healthy",
      minutes_since_last_success: Math.round(minutesSince * 10) / 10,
      expected_interval_minutes: intervalMinutes,
    });
  }

  return results;
}

/** Collapses getScheduledJobHealth() into one status string, matching the
 * style of monitoring.ts's other dependency checks (e.g. checkBullmqWorkers)
 * so it slots into getDependenciesStatus/getHealth's existing shape. */
export async function checkScheduledJobsHealth(): Promise<string> {
  const jobs = await getScheduledJobHealth();
  const problems = jobs.filter((j) => j.status !== "healthy");
  if (problems.length === 0) return "healthy";
  return problems
    .map((j) =>
      j.status === "never_run"
        ? `${j.job_name}: never run`
        : `${j.job_name}: stale (${j.minutes_since_last_success}min since last success, expected <=${Math.round(j.expected_interval_minutes * STALENESS_MULTIPLIER)}min)`,
    )
    .join("; ");
}

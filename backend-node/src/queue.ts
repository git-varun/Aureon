import { Worker, type Job } from "bullmq";
import { ingestQuote } from "./jobs/ingestQuote";
import { evaluateWatchlistAlertsTask } from "./jobs/evaluateWatchlistAlerts";
import { sweepStaleJobLogsTask } from "./jobs/sweepStaleJobLogs";
import { refreshTrackedUniverseTask } from "./jobs/refreshTrackedUniverse";
import { refreshMutualFundNavsTask } from "./jobs/refreshMutualFundNavs";
import { seedPriceHistoryTask } from "./jobs/seedPriceHistory";
import { refreshPricesTask } from "./jobs/refreshPrices";
import { dailyBriefingTask } from "./jobs/dailyBriefing";
import { weeklyBriefingTask } from "./jobs/weeklyBriefing";
import { monthlyBriefingTask } from "./jobs/monthlyBriefing";
import {
  bullmqConnection as connection,
  QUOTES_QUEUE_NAME,
  WATCHLIST_ALERTS_QUEUE_NAME,
  SCHEDULED_JOBS_QUEUE_NAME,
  scheduledJobsQueue,
  type IngestQuoteJobData,
  type EvaluateWatchlistAlertsJobData,
} from "./lib/jobs/queues";

export * from "./lib/jobs/queues";

/** No repeatable/cron schedule is registered for these two queues — jobs
 * only ever enter them via an explicit queue.add() call from a manual
 * trigger script. sweep_stale_job_logs (below) is the first job cut over
 * to a real repeatable BullMQ schedule; see SCHEDULED_JOBS_QUEUE_NAME. */
export function startIngestQuoteWorker(): Worker<IngestQuoteJobData, boolean> {
  return new Worker<IngestQuoteJobData, boolean>(
    QUOTES_QUEUE_NAME,
    async (job: Job<IngestQuoteJobData>) => ingestQuote(job.data.providerName, job.data.symbol),
    { connection },
  );
}

export function startEvaluateWatchlistAlertsWorker(): Worker<EvaluateWatchlistAlertsJobData, void> {
  return new Worker<EvaluateWatchlistAlertsJobData, void>(
    WATCHLIST_ALERTS_QUEUE_NAME,
    async (job: Job<EvaluateWatchlistAlertsJobData>) => evaluateWatchlistAlertsTask(job.data.symbol),
    { connection },
  );
}

// Matches Python's beat_schedule crontab(minute="*/30") exactly (every 30
// minutes, every hour, UTC — celery_app.py pins conf.timezone = "UTC") —
// upsertJobScheduler is idempotent: safe to call on every process start
// without creating duplicate repeatable jobs. tz is set explicitly (not
// left to the process's local TZ) since future jobs on this queue will
// have hour-pinned crontabs where that distinction actually matters.
export async function registerSweepStaleJobLogsSchedule(): Promise<void> {
  await scheduledJobsQueue.upsertJobScheduler(
    "sweep-stale-job-logs",
    { pattern: "*/30 * * * *", tz: "UTC" },
    { name: "sweepStaleJobLogs" },
  );
}

// Matches Python's beat_schedule crontab(hour=4, minute=0) exactly — daily
// at 04:00 UTC. Second job cut over per migration plan Task 3 Step 2 (picked
// as the lowest-risk of the remaining 4: daily, no live financial writes on
// refreshPrices' scale).
export async function registerRefreshTrackedUniverseSchedule(): Promise<void> {
  await scheduledJobsQueue.upsertJobScheduler(
    "refresh-tracked-universe",
    { pattern: "0 4 * * *", tz: "UTC" },
    { name: "refreshTrackedUniverse" },
  );
}

// Matches Python's beat_schedule crontab(hour=23, minute=0) exactly — daily
// at 23:00 UTC. Third job cut over per migration plan Task 3 Step 3.
export async function registerRefreshMutualFundNavsSchedule(): Promise<void> {
  await scheduledJobsQueue.upsertJobScheduler(
    "refresh-mutual-fund-navs",
    { pattern: "0 23 * * *", tz: "UTC" },
    { name: "refreshMutualFundNavs" },
  );
}

// Matches Python's beat_schedule crontab(hour=2, minute=0, day_of_week="sun")
// exactly — weekly, Sunday 02:00 UTC. Cron day-of-week 0 = Sunday.
export async function registerSeedPriceHistorySchedule(): Promise<void> {
  await scheduledJobsQueue.upsertJobScheduler(
    "seed-price-history",
    { pattern: "0 2 * * 0", tz: "UTC" },
    { name: "seedPriceHistory" },
  );
}

// Matches Python's beat_schedule crontab(minute=0, hour="*") exactly —
// hourly, on the hour, UTC. Last and highest-risk of the four (per plan
// Task 3 Step 3: highest-traffic, verify no double-enqueue of ingestQuote
// during cutover — see migration plan note; this repo has no persistent
// Python beat process running concurrently with a Node worker at any point
// during this cutover, since the Python beat_schedule entry is removed in
// the same change, so there is no window where both sides fire this job).
export async function registerRefreshPricesSchedule(): Promise<void> {
  await scheduledJobsQueue.upsertJobScheduler(
    "hourly-price-refresh",
    { pattern: "0 * * * *", tz: "UTC" },
    { name: "refreshPrices" },
  );
}

// Matches Python's beat_schedule crontab(hour=8, minute=0) exactly — daily
// at 08:00 UTC. Task 6 Step 3 — re-verified fresh against celery_app.py at
// execution time (daily-briefing/weekly-briefing/monthly-briefing were still
// present in beat_schedule, unremoved, as of this port).
export async function registerDailyBriefingSchedule(): Promise<void> {
  await scheduledJobsQueue.upsertJobScheduler(
    "daily-briefing",
    { pattern: "0 8 * * *", tz: "UTC" },
    { name: "dailyBriefing" },
  );
}

// Matches Python's beat_schedule crontab(hour=8, minute=30, day_of_week="mon")
// exactly — weekly, Monday 08:30 UTC. Cron day-of-week 1 = Monday.
export async function registerWeeklyBriefingSchedule(): Promise<void> {
  await scheduledJobsQueue.upsertJobScheduler(
    "weekly-briefing",
    { pattern: "30 8 * * 1", tz: "UTC" },
    { name: "weeklyBriefing" },
  );
}

// Matches Python's beat_schedule crontab(hour=9, minute=0, day_of_month=1)
// exactly — monthly, 1st-of-month 09:00 UTC.
export async function registerMonthlyBriefingSchedule(): Promise<void> {
  await scheduledJobsQueue.upsertJobScheduler(
    "monthly-briefing",
    { pattern: "0 9 1 * *", tz: "UTC" },
    { name: "monthlyBriefing" },
  );
}

// Job-name -> handler map, not one Worker per job — q_scheduled_jobs is
// meant to carry every cron-driven job cut over from Celery beat (see
// migration plan Task 3), so a future job landing here only needs an entry
// added, not a whole new Worker/queue wiring.
const SCHEDULED_JOB_HANDLERS: Record<string, () => Promise<void>> = {
  sweepStaleJobLogs: sweepStaleJobLogsTask,
  refreshTrackedUniverse: refreshTrackedUniverseTask,
  refreshMutualFundNavs: refreshMutualFundNavsTask,
  seedPriceHistory: seedPriceHistoryTask,
  refreshPrices: refreshPricesTask,
  dailyBriefing: dailyBriefingTask,
  weeklyBriefing: weeklyBriefingTask,
  monthlyBriefing: monthlyBriefingTask,
};

export function startScheduledJobsWorker(): Worker<undefined, void> {
  return new Worker<undefined, void>(
    SCHEDULED_JOBS_QUEUE_NAME,
    async (job: Job<undefined>) => {
      const handler = SCHEDULED_JOB_HANDLERS[job.name];
      if (!handler) return;
      await handler();
    },
    { connection },
  );
}

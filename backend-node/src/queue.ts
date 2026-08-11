import { Worker, type Job } from "bullmq";
import { ingestQuote } from "./jobs/ingestQuote";
import { evaluateWatchlistAlertsTask } from "./jobs/evaluateWatchlistAlerts";
import { sweepStaleJobLogsTask } from "./jobs/sweepStaleJobLogs";
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

// Keyed on job.name, not just the queue — q_scheduled_jobs is meant to
// carry every cron-driven job cut over from Celery beat, not just this
// one, so a future second job landing here must not silently run this
// handler.
export function startSweepStaleJobLogsWorker(): Worker<undefined, void> {
  return new Worker<undefined, void>(
    SCHEDULED_JOBS_QUEUE_NAME,
    async (job: Job<undefined>) => {
      if (job.name !== "sweepStaleJobLogs") return;
      await sweepStaleJobLogsTask();
    },
    { connection },
  );
}

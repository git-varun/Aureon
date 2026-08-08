import { Worker, type Job } from "bullmq";
import { ingestQuote } from "./jobs/ingestQuote";
import { evaluateWatchlistAlertsTask } from "./jobs/evaluateWatchlistAlerts";
import {
  bullmqConnection as connection,
  QUOTES_QUEUE_NAME,
  WATCHLIST_ALERTS_QUEUE_NAME,
  type IngestQuoteJobData,
  type EvaluateWatchlistAlertsJobData,
} from "./lib/jobs/queues";

export * from "./lib/jobs/queues";

/** No repeatable/cron schedule is registered anywhere in this phase — see
 * the Phase 3 report's concurrent-writer decision. Jobs only ever enter this
 * queue via an explicit queue.add() call from a manual trigger script. */
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

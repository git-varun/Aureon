import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { ingestQuote } from "./jobs/ingestQuote";

// BullMQ requires maxRetriesPerRequest: null on its Redis connection.
const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

// Mirrors Python's q_ingestion queue name (celery_app.py's task_routes) —
// same conceptual queue, not a shared literal broker queue (Celery and
// BullMQ use incompatible wire formats on Redis; this is a fresh queue on
// the same Redis instance, not cross-consumption).
export const QUOTES_QUEUE_NAME = "q_ingestion";

export const quotesQueue = new Queue(QUOTES_QUEUE_NAME, { connection });

export interface IngestQuoteJobData {
  providerName: string;
  symbol: string;
}

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

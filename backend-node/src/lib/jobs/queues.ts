import { Queue } from "bullmq";
import IORedis from "ioredis";

// BullMQ requires maxRetriesPerRequest: null on its Redis connection.
const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

// Queue definitions live here (not in ../../queue.ts, which also defines
// the worker functions) so job modules like jobs/ingestQuote.ts can enqueue
// into watchlistAlertsQueue without a queue.ts <-> jobs/ingestQuote.ts
// import cycle (queue.ts imports ingestQuote.ts to build its worker).

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

// Separate queue from q_ingestion — evaluate_watchlist_alerts is dispatched
// per-quote-write (like Celery's .delay(symbol)), not part of the price
// ingestion pipeline itself, so it gets its own queue name.
export const WATCHLIST_ALERTS_QUEUE_NAME = "q_watchlist_alerts";

export const watchlistAlertsQueue = new Queue(WATCHLIST_ALERTS_QUEUE_NAME, { connection });

export interface EvaluateWatchlistAlertsJobData {
  symbol: string;
}

export { connection as bullmqConnection };

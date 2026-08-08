import "dotenv/config";
import { startIngestQuoteWorker, startEvaluateWatchlistAlertsWorker } from "../src/queue";

// Manual/dev entrypoint — starts BullMQ workers consuming q_ingestion and
// q_watchlist_alerts. Nothing schedules jobs onto q_ingestion automatically
// this phase; see triggerRefreshPrices.ts for the manual trigger.
// q_watchlist_alerts is populated by ingestQuote/refreshTrackedUniverse
// themselves right after each quote write.
const worker = startIngestQuoteWorker();

worker.on("completed", (job) => {
  console.log(`ingestQuote completed: ${JSON.stringify(job.data)}`);
});
worker.on("failed", (job, err) => {
  console.error(`ingestQuote failed: ${JSON.stringify(job?.data)} — ${err.message}`);
});

const alertsWorker = startEvaluateWatchlistAlertsWorker();

alertsWorker.on("completed", (job) => {
  console.log(`evaluateWatchlistAlerts completed: ${JSON.stringify(job.data)}`);
});
alertsWorker.on("failed", (job, err) => {
  console.error(`evaluateWatchlistAlerts failed: ${JSON.stringify(job?.data)} — ${err.message}`);
});

console.log("BullMQ worker listening on q_ingestion and q_watchlist_alerts (no repeatable schedule registered)");

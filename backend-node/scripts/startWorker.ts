import "dotenv/config";
import { startIngestQuoteWorker } from "../src/queue";

// Manual/dev entrypoint — starts a BullMQ worker consuming the q_ingestion
// queue. Nothing schedules jobs onto this queue automatically this phase;
// see triggerRefreshPrices.ts for the manual trigger.
const worker = startIngestQuoteWorker();

worker.on("completed", (job) => {
  console.log(`ingestQuote completed: ${JSON.stringify(job.data)}`);
});
worker.on("failed", (job, err) => {
  console.error(`ingestQuote failed: ${JSON.stringify(job?.data)} — ${err.message}`);
});

console.log("BullMQ worker listening on q_ingestion (no repeatable schedule registered)");

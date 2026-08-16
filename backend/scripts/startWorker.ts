import "dotenv/config";
import {
  startIngestQuoteWorker,
  startEvaluateWatchlistAlertsWorker,
  startScheduledJobsWorker,
  registerSweepStaleJobLogsSchedule,
  registerRefreshTrackedUniverseSchedule,
  registerRefreshMutualFundNavsSchedule,
  registerSeedPriceHistorySchedule,
  registerRefreshPricesSchedule,
  registerDailyBriefingSchedule,
  registerWeeklyBriefingSchedule,
  registerMonthlyBriefingSchedule,
  registerRefreshFundamentalsSchedule,
  registerFetchNewsSchedule,
} from "../src/queue";

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

const scheduledWorker = startScheduledJobsWorker();

scheduledWorker.on("completed", (job) => {
  console.log(`${job.name} completed`);
});
scheduledWorker.on("failed", (job, err) => {
  console.error(`${job?.name} failed: ${err.message}`);
});

async function start() {
  await registerSweepStaleJobLogsSchedule();
  await registerRefreshTrackedUniverseSchedule();
  await registerRefreshMutualFundNavsSchedule();
  await registerSeedPriceHistorySchedule();
  await registerRefreshPricesSchedule();
  await registerDailyBriefingSchedule();
  await registerWeeklyBriefingSchedule();
  await registerMonthlyBriefingSchedule();
  await registerRefreshFundamentalsSchedule();
  await registerFetchNewsSchedule();
  console.log("BullMQ worker listening on q_ingestion, q_watchlist_alerts, q_scheduled_jobs");
  console.log(
    "Repeatable schedules registered: sweep-stale-job-logs (*/30 * * * * UTC), " +
      "refresh-tracked-universe (0 4 * * * UTC), refresh-mutual-fund-navs (0 23 * * * UTC), " +
      "seed-price-history (0 2 * * 0 UTC), hourly-price-refresh (0 * * * * UTC), " +
      "daily-briefing (0 8 * * * UTC), weekly-briefing (30 8 * * 1 UTC), monthly-briefing (0 9 1 * * UTC), " +
      "refresh-fundamentals (0 6 * * * UTC), news-refresh (0 */4 * * * UTC)",
  );
}

start();

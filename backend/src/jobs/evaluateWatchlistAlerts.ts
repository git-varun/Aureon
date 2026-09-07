import { prisma } from "../prisma";
import { evaluateAlerts, type ActiveAlert } from "../lib/watchlist/alerts";
import { createNotification } from "../lib/notifications";
import { isResetInProgress } from "../lib/marketProviders/redisRateLimit";
import { logger } from "../lib/logger";

/** Port of WatchlistsRepository.list_active_alerts_for_symbol — WatchlistSymbol
 * rows with a live alertPrice for this symbol, paired with their owning
 * watchlist's user_id (needed to address the notification). */
async function listActiveAlertsForSymbol(symbol: string): Promise<ActiveAlert[]> {
  const rows = await prisma.watchlistSymbol.findMany({
    where: { symbol, alertPrice: { not: null } },
    include: { watchlist: true },
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.watchlist.user_id,
    alertPrice: Number(row.alertPrice),
    alertDirection: (row.alertDirection ?? "gte") as "gte" | "lte",
    alertTriggered: row.alertTriggered,
  }));
}

/** Port of the app.workers.monitoring.watchlist_alerts.evaluate_watchlist_alerts
 * Celery task. Takes a bare symbol (no price arg) — re-reads LatestQuote
 * itself, so it must run after the quote write commits. Bails silently if
 * no LatestQuote row or price is null, matching Python. */
async function evaluateWatchlistAlerts(symbol: string): Promise<{ fired: string[]; price: number | null }> {
  const quote = await prisma.latestQuote.findUnique({ where: { symbol } });
  if (!quote || quote.price === null) return { fired: [], price: null };

  const price = Number(quote.price);
  const alerts = await listActiveAlertsForSymbol(symbol);
  const { fired, updates } = evaluateAlerts(alerts, symbol, price);

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) => prisma.watchlistSymbol.update({ where: { id: u.id }, data: { alertTriggered: u.alertTriggered } })),
    );
  }
  for (const notification of fired) {
    await createNotification(notification);
  }
  if (fired.length > 0) {
    logger.info({ job: "evaluate_watchlist_alerts", symbol, fired: fired.length }, "watchlist alert(s) fired");
  }
  return { fired: fired.map((f) => f.message), price };
}

/** Job entrypoint. BUG-M: this job is enqueued once per symbol per quote
 * cycle (~220/h). Wrapping every invocation in wrapJobExecution wrote one
 * job_logs row per invocation — 3857 rows, all SUCCESS/{"fired":0}, 91% of
 * all job history — making Job History unreadable and forcing
 * sweep_stale_job_logs onto a 30-min cadence to keep up. Python never logged
 * this task at all (plain @shared_task, no JobConfig row). We now write a
 * single already-closed job_logs row only when an invocation is materially
 * notable — an alert fired or the evaluation threw — so a quiet cycle
 * (100% of history to date) writes nothing, and a fired alert is recorded
 * with per-symbol detail. Not a behavioural change: alert-firing logic and
 * notification.* writes are untouched. wrapJobExecution's isResetInProgress
 * guard is kept inline; its markJobRan / skipIfDisabled calls were no-ops
 * here (no evaluate_watchlist_alerts row in job_configs). */
export async function evaluateWatchlistAlertsTask(symbol: string): Promise<void> {
  if (await isResetInProgress()) {
    logger.warn({ job: "evaluate_watchlist_alerts" }, "job skipped — data reset in progress");
    return;
  }

  const startedAt = new Date();
  try {
    const { fired, price } = await evaluateWatchlistAlerts(symbol);
    if (fired.length > 0) {
      const endedAt = new Date();
      await prisma.jobLog.create({
        data: {
          jobName: "evaluate_watchlist_alerts",
          status: "SUCCESS",
          startedAt,
          endedAt,
          durationMs: endedAt.getTime() - startedAt.getTime(),
          resultSummary: { symbol, price, fired: fired.length, alerts: fired },
        },
      });
    }
  } catch (e) {
    const endedAt = new Date();
    await prisma.jobLog
      .create({
        data: {
          jobName: "evaluate_watchlist_alerts",
          status: "FAILED",
          startedAt,
          endedAt,
          durationMs: endedAt.getTime() - startedAt.getTime(),
          errorMessage: ((e as Error)?.stack ?? String(e)).slice(0, 4000),
          resultSummary: { symbol },
        },
      })
      .catch((logErr) => {
        logger.error({ err: logErr }, "evaluateWatchlistAlerts: failed to write job_logs row");
      });
    throw e;
  }
}

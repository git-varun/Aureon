import { prisma } from "../prisma";
import { evaluateAlerts, type ActiveAlert } from "../lib/watchlist/alerts";
import { createNotification } from "../lib/notifications";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";

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
async function evaluateWatchlistAlerts(symbol: string): Promise<{ fired: number }> {
  const quote = await prisma.latestQuote.findUnique({ where: { symbol } });
  if (!quote || quote.price === null) return { fired: 0 };

  const alerts = await listActiveAlertsForSymbol(symbol);
  const { fired, updates } = evaluateAlerts(alerts, symbol, Number(quote.price));

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) => prisma.watchlistSymbol.update({ where: { id: u.id }, data: { alertTriggered: u.alertTriggered } })),
    );
  }
  for (const notification of fired) {
    await createNotification(notification);
  }
  return { fired: fired.length };
}

/** Job entrypoint following the Phase 3/4 skipIfDisabled/wrapJobExecution
 * shape. Unlike Python's evaluate_watchlist_alerts (a plain @shared_task with
 * no _skip_if_disabled/_wrap_job_execution wrapping and no JobConfig row at
 * all — it isn't part of the beat schedule, only ever .delay()'d per-quote),
 * this Node port deliberately opts into the job_logs lifecycle for
 * consistency with every other job ported so far. Divergence, not a bug. */
export async function evaluateWatchlistAlertsTask(symbol: string, logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("evaluate_watchlist_alerts", logId)) return;
  await wrapJobExecution("evaluate_watchlist_alerts", logId, () => evaluateWatchlistAlerts(symbol));
}

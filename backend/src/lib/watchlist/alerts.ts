export interface ActiveAlert {
  id: string;
  userId: string | null;
  alertPrice: number;
  alertDirection: "gte" | "lte";
  alertTriggered: boolean;
}

export interface FiredNotification {
  userId: string | null;
  title: string;
  message: string;
  type: string;
}

export interface EvaluateAlertsResult {
  fired: FiredNotification[];
  // WatchlistSymbol rows whose alertTriggered flag changed and must be persisted.
  updates: { id: string; alertTriggered: boolean }[];
}

/** Pure port of WatchlistService.evaluate_alerts. Checks every watchlist
 * alert on `symbol` against the latest `price`. Fires (returns a
 * notification payload for) each alert whose threshold was just crossed,
 * and flags alertTriggered so a stale-but-still-crossed price doesn't
 * re-fire on the next evaluation. Resets alertTriggered once price moves
 * back to the non-triggered side, so a later re-crossing can fire again. */
export function evaluateAlerts(alerts: ActiveAlert[], symbol: string, price: number): EvaluateAlertsResult {
  const fired: FiredNotification[] = [];
  const updates: { id: string; alertTriggered: boolean }[] = [];

  for (const alert of alerts) {
    const target = alert.alertPrice;
    const isTriggeredSide = alert.alertDirection === "gte" ? price >= target : price <= target;

    if (isTriggeredSide && !alert.alertTriggered) {
      updates.push({ id: alert.id, alertTriggered: true });
      const verb = alert.alertDirection === "gte" ? "rose to" : "fell to";
      fired.push({
        userId: alert.userId,
        title: `${symbol} alert triggered`,
        message: `${symbol} ${verb} ${price}, target was ${target}`,
        type: "info",
      });
    } else if (!isTriggeredSide && alert.alertTriggered) {
      updates.push({ id: alert.id, alertTriggered: false });
    }
  }

  return { fired, updates };
}

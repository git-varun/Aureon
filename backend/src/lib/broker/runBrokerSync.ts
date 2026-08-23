import { prisma } from "../../prisma";
import { getDecryptedKey } from "../settings/providers";
import { generatePortfolioSnapshot } from "../snapshot";
import { getSessionTimeZone, naiveToUtc } from "../tz";
import { refreshAllQuotes } from "../../jobs/refreshPrices";
import type { SyncResult } from "./brokerSync";
import { logger } from "../logger";

/** Port of PortfolioService.list_all (via _list_portfolio_entries — loads
 * portfolio ids in a short-lived read, matching Python's separate session so
 * a later rollback elsewhere cannot expire these values; not a concern in
 * Node/Prisma, but kept as its own query for parity). */
async function listPortfolioIds(): Promise<string[]> {
  const rows = await prisma.portfolio.findMany({ select: { id: true } });
  return rows.map((r) => r.id);
}

/** Port of ProviderFactory.get(name, required=False)'s "is this provider
 * configured/enabled" gate, without instantiating anything — the caller
 * decides what to build from the credentials. Returns null (skip, no-op) if
 * the ProviderConfig row is missing, disabled, or PLANNED/DISABLED status;
 * otherwise returns the decrypted credentials for the given key names
 * (missing/blank keys omitted, matching Python's `if v` filter). */
export async function resolveProviderCredentials(providerName: string, keyNames: string[]): Promise<Record<string, string> | null> {
  const cfg = await prisma.providerConfig.findUnique({ where: { providerName } });
  if (!cfg) return null;
  if (!cfg.enabled || cfg.status === "PLANNED" || cfg.status === "DISABLED") return null;

  const creds: Record<string, string> = {};
  for (const key of keyNames) {
    const value = await getDecryptedKey(providerName, key);
    if (value) creds[key] = value;
  }
  return creds;
}

/** Most recent Transaction.transaction_date already captured for this
 * broker+kind, across all portfolios — used as the "since last successful
 * sync" watermark for providers (Binance) whose history endpoints default
 * to a narrow recent-only window. Each event kind (trades, income,
 * deposits, withdrawals, dividends) accumulates independently, so each
 * needs its own watermark rather than sharing one. `filters` narrows
 * further where a single kind covers several independently-accumulating
 * event streams — deposits vs withdrawals share kind="broker_transfer"
 * (split by transactionType), and USDⓈ-M vs COIN-M income share
 * kind="broker_income" (split by wallet). Without that split, a transient
 * failure on one endpoint would have its missed window silently closed by
 * its sibling's newer rows. Returns null on a first-ever sync of this
 * kind. */
export async function lastTransactionAt(
  providerName: string,
  kind: string,
  filters: { transactionType?: string; wallet?: string } = {},
): Promise<Date | null> {
  const result = await prisma.transaction.aggregate({
    _max: { transactionDate: true },
    where: { broker: providerName, kind, ...filters },
  });
  const raw = result._max.transactionDate;
  if (!raw) return null;
  const tzName = await getSessionTimeZone();
  return naiveToUtc(raw, tzName);
}

/** Back-compat alias — trades specifically, the only kind that existed
 * before this wave. */
export async function lastBrokerTradeAt(providerName: string): Promise<Date | null> {
  return lastTransactionAt(providerName, "broker_trade");
}

/** Port of _run_broker_sync's post-sync tail: refresh quotes for every
 * held/watchlisted symbol, then regenerate each portfolio's snapshot.
 * Per-portfolio failures are caught and logged, matching Python's
 * except-and-continue loop (one bad portfolio must not abort the others). */
export async function refreshQuotesAndSnapshots(jobName: string): Promise<void> {
  await refreshAllQuotes();

  for (const portfolioId of await listPortfolioIds()) {
    try {
      await generatePortfolioSnapshot(portfolioId);
    } catch (e) {
      logger.warn({ job: jobName, portfolioId, err: e }, "snapshot failed");
    }
  }
}

/** Port of _run_broker_sync's per-portfolio apply loop — applies already-
 * fetched holdings to every portfolio via `applyFn`, catching and logging
 * per-portfolio failures (one bad portfolio must not abort the others). */
export async function applyHoldingsToAllPortfolios(
  jobName: string,
  applyFn: (portfolioId: string) => Promise<SyncResult>,
): Promise<void> {
  for (const portfolioId of await listPortfolioIds()) {
    try {
      await applyFn(portfolioId);
      logger.info({ job: jobName, portfolioId }, "holdings synced");
    } catch (e) {
      logger.warn({ job: jobName, portfolioId, err: e }, "sync failed");
    }
  }
}

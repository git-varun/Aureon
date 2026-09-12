import { SEED_UNIVERSES } from "../lib/market/seedUniverses";
import { backfillHistory } from "../lib/market/backfillHistory";
import { resolveQuoteProvider } from "../lib/marketProviders/routing";
import { ingestQuote } from "./ingestQuote";
import { ensureTrackedAsset, saveQuote } from "../lib/jobs/ingestionRepo";
import { getTopMarketCapCoins, SYMBOL_TO_COINGECKO_ID } from "../lib/marketProviders/coingecko";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";
import { logJobStart } from "../lib/jobs/config";
import { prisma } from "../prisma";
import type { Prisma } from "../generated/prisma";
import type { NormalizedQuote } from "../lib/marketProviders/types";
import { logger } from "../lib/logger";

const JOB_NAME = "seed_tracked_universes";

interface UniverseResult {
  symbols: number;
  quoted: number;
  failed: number;
  history_rows: number;
}

// Checkpoint granularity is per-universe (the job's existing 5 equity
// groups + crypto_top100 phase structure), not per-symbol — each phase
// finishes in seconds to a few minutes post fix (c)'s pacing removal, so
// per-symbol resumability would be finer-grained than this manual,
// infrequent job needs. State lives directly on the job_logs row this run
// is writing to (resultSummary), the same shape wrapJobExecution's
// logJobEnd would write on a normal completion — no new table.
//
// A prior run only counts as resumable if it's within RESUME_WINDOW_MS: this
// is a rare/manual bulk-seed job, so an interruption from days ago likely
// means the market data it already wrote is stale anyway — better to redo
// it than trust it.
const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

// A RUNNING row younger than this might be a genuinely concurrent run (two
// workers briefly overlapping, or a fast re-dispatch) rather than an
// abandoned one — resuming from it would let both runs skip phases neither
// actually finished. sweepStaleRunningJobs' own threshold is 2h, so a real
// crash's row is always well past this floor by the time a retry checks.
const MIN_ABANDONED_MS = 60 * 1000;

/** Finds the most recent *other* RUNNING run of this job — still-open from
 * a crashed worker (2h stale-sweep threshold, well beyond MIN_ABANDONED_MS,
 * means it's always still RUNNING when a retry lands within this window) —
 * and returns whatever phases it had already checkpointed. Deliberately
 * excludes FAILED: sweepStaleRunningJobs never clears resultSummary when it
 * closes out a stale row, so a FAILED row can carry a checkpoint too, but a
 * FAILED status means something closed the run out deliberately (a real
 * provider error, a bug) — resuming past that would silently skip a phase
 * that never actually succeeded. A prior SUCCESS run is not resumed from
 * either — a fresh manual trigger after a clean completion means the user
 * wants a fresh seed, not a skip-everything no-op. */
async function loadCheckpoint(excludeLogId: number): Promise<Record<string, UniverseResult>> {
  const now = Date.now();
  const prev = await prisma.jobLog.findFirst({
    where: {
      jobName: JOB_NAME,
      id: { not: excludeLogId },
      status: "RUNNING",
      startedAt: { gte: new Date(now - RESUME_WINDOW_MS), lte: new Date(now - MIN_ABANDONED_MS) },
    },
    orderBy: { startedAt: "desc" },
  });
  return (prev?.resultSummary as Record<string, UniverseResult> | null) ?? {};
}

async function persistProgress(logId: number, results: Record<string, UniverseResult>): Promise<void> {
  await prisma.jobLog.update({ where: { id: logId }, data: { resultSummary: results as unknown as Prisma.InputJsonValue } });
}

/** Port of IndexUniverseSeedService.seed_equity_universes — walks each
 * SEED_UNIVERSES list, creates/tracks the Asset, quotes it, and backfills
 * history. Mutates `results` in place, persisting it after each universe
 * completes so a mid-run crash resumes instead of restarting. */
async function seedEquityUniverses(logId: number, results: Record<string, UniverseResult>): Promise<void> {
  for (const [universeName, symbols] of Object.entries(SEED_UNIVERSES)) {
    if (results[universeName]) continue; // already checkpointed by a prior interrupted run

    let quoted = 0;
    let failed = 0;
    let historyRows = 0;
    for (const symbol of symbols) {
      const providerName = resolveQuoteProvider(symbol, "equity");
      const asset = await ensureTrackedAsset(symbol, symbol, "equity");
      try {
        await ingestQuote(providerName, symbol);
        quoted += 1;
      } catch (e) {
        failed += 1;
        logger.warn({ job: "seed_tracked_universes", symbol, err: e }, "quote failed");
      }
      historyRows += await backfillHistory(asset.id, symbol, providerName);
    }
    results[universeName] = { symbols: symbols.length, quoted, failed, history_rows: historyRows };
    logger.info({ job: "seed_tracked_universes", universeName, ...results[universeName] }, "universe seeded");
    await persistProgress(logId, results);
  }
}

// Known stablecoin CoinGecko ids among the live top-100-by-market-cap set —
// used to classify seeded crypto assets as asset_class "stablecoin" instead
// of "crypto" (matches classify()'s distinction). Not exhaustive by design.
const KNOWN_STABLECOIN_IDS = new Set([
  "tether", "usd-coin", "binance-usd", "dai", "first-digital-usd",
  "true-usd", "usdd", "frax", "paypal-usd", "ethena-usde", "usds",
  "gemini-dollar",
]);

/** Port of _crypto_symbol_and_class — reuse the existing pretty
 * {TICKER}-USD form when this ticker is already curated in
 * SYMBOL_TO_COINGECKO_ID *and* resolves to the same real id, otherwise fall
 * back to {coingecko_id}-USD (always globally unique). */
function cryptoSymbolAndClass(coin: { id: string; symbol: string }): [string, string] {
  const curatedId = SYMBOL_TO_COINGECKO_ID[coin.symbol];
  const symbol = curatedId === coin.id ? `${coin.symbol}-USD` : `${coin.id}-USD`;
  const assetClass = KNOWN_STABLECOIN_IDS.has(coin.id) ? "stablecoin" : "crypto";
  return [symbol, assetClass];
}

/** Port of IndexUniverseSeedService.seed_crypto_top100. Discovers the live
 * top-`limit`-by-market-cap coins in a single CoinGecko call, seeds quotes
 * for all of them from that one response, then backfills price history
 * per-coin. The history loop is unpaced: backfillHistory has no CoinGecko
 * history provider, so curated coins are served by Yahoo (no call budget)
 * and non-curated coins return 0 rows without any network call — the old
 * 21s inter-coin sleep was calibrated for a CoinGecko budget this code path
 * never spends. The one budgeted CoinGecko call is getTopMarketCapCoins
 * above, already guarded by its own checkBudget. */
async function seedCryptoTop100(logId: number, results: Record<string, UniverseResult>, limit = 100): Promise<void> {
  if (results.crypto_top100) return; // already checkpointed by a prior interrupted run

  const coins = await getTopMarketCapCoins(limit);

  let quoted = 0;
  let failed = 0;
  const seeded: Array<{ assetId: string; symbol: string }> = [];
  for (const coin of coins) {
    const [symbol, assetClass] = cryptoSymbolAndClass(coin);
    const asset = await ensureTrackedAsset(symbol, coin.name ?? symbol, assetClass);
    if (coin.price == null) {
      failed += 1;
      continue;
    }
    const quote: NormalizedQuote = { symbol, provider: "coingecko", timestamp: new Date(), price: coin.price, volume: null, currency: null };
    try {
      await saveQuote("coingecko", quote);
      quoted += 1;
      seeded.push({ assetId: asset.id, symbol });
    } catch (e) {
      failed += 1;
      logger.warn({ job: "seed_tracked_universes", symbol, err: e }, "crypto quote save failed");
    }
  }

  let historyRows = 0;
  for (const s of seeded) {
    historyRows += await backfillHistory(s.assetId, s.symbol, "coingecko");
  }

  results.crypto_top100 = { symbols: coins.length, quoted, failed, history_rows: historyRows };
  logger.info({ job: "seed_tracked_universes", universeName: "crypto_top100", ...results.crypto_top100 }, "universe seeded");
  await persistProgress(logId, results);
}

/** Port of IndexUniverseSeedService.seed_tracked_universes. `logId` is
 * always resolved (see seedTrackedUniversesTask below) so checkpointing can
 * read/write the right job_logs row regardless of which dispatch path
 * called this task. */
async function seedTrackedUniverses(logId: number): Promise<Record<string, UniverseResult>> {
  const results = await loadCheckpoint(logId);
  if (Object.keys(results).length > 0) {
    logger.info({ job: "seed_tracked_universes", resuming: Object.keys(results) }, "resuming from checkpoint");
  }
  await seedEquityUniverses(logId, results);
  await seedCryptoTop100(logId, results);
  logger.info({ job: "seed_tracked_universes", results }, "completed");
  return results;
}

/** Port of seed_tracked_universes_task (the @_skip_if_disabled /
 * @shared_task decorator pair). Rare/manual "Run Now" job — enabled=False by
 * default (see jobDefaults.ts), no BullMQ repeatable schedule registered
 * anywhere — one-time (or occasional) bulk operation, unlike every other
 * JobConfig entry.
 *
 * logId is resolved here (not left to wrapJobExecution's own null-handling)
 * so seedTrackedUniverses can checkpoint against the same row wrapJobExecution
 * is tracking — the BullMQ-dispatched path (queue.ts's SCHEDULED_JOB_HANDLERS)
 * calls this with no logId at all, same as every other queued job. */
export async function seedTrackedUniversesTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled(JOB_NAME, logId)) return;
  const resolvedLogId = logId ?? (await logJobStart(JOB_NAME)).id;
  await wrapJobExecution(JOB_NAME, resolvedLogId, () => seedTrackedUniverses(resolvedLogId));
}

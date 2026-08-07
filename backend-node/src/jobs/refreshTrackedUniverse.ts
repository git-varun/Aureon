import { prisma } from "../prisma";
import { ProviderError } from "../lib/errors";
import { skipQuoteIngestion, resolveQuoteProvider } from "../lib/marketProviders/routing";
import { getQuotesByIds, SYMBOL_TO_COINGECKO_ID } from "../lib/marketProviders/coingecko";
import { cacheQuote } from "../lib/marketProviders/redisRateLimit";
import { listTrackedSymbolsForRefresh, saveQuote, recordPriceHistory, recordFailure, getOrCreateProvider } from "../lib/jobs/ingestionRepo";
import { quotesQueue } from "../queue";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";
import type { NormalizedQuote } from "../lib/marketProviders/types";

/** Port of _coin_id — same curated-ticker-vs-raw-CoinGecko-id resolution as
 * coingecko.ts's private coinId(), duplicated here (not exported from
 * coingecko.ts) since the bulk task needs to keep the symbol -> id mapping
 * around across the batch call, unlike the per-quote path. */
function coinId(symbol: string): string {
  const raw = symbol.endsWith("-USD") ? symbol.slice(0, -4) : symbol;
  const curated = SYMBOL_TO_COINGECKO_ID[raw.toUpperCase()];
  if (curated) return curated;
  if (raw === raw.toLowerCase()) return raw;
  throw new ProviderError(`coingecko: no curated CoinGecko id mapping for symbol ${symbol}`);
}

/** Port of _refresh_tracked_crypto_bulk. Refreshes tracked-only crypto/
 * stablecoin quotes via one-or-few CoinGecko bulk calls instead of one
 * Celery-dispatched ingestQuote per symbol — the per-symbol path shared a
 * single 2-calls/60s local budget across the whole batch, so for a ~100-coin
 * tracked universe only ~2 won the budget race each cycle and the rest
 * failed with no retry, silently starving most of the tracked crypto
 * universe of price updates every day. Runs inline rather than via the
 * queue since it's now a small, fixed number of calls, not one per symbol.
 *
 * Does not dispatch evaluate_watchlist_alerts — that Celery task chain is
 * outside this phase's scope, same as ingestQuote.ts's port of ingest_quote. */
async function refreshTrackedCryptoBulk(symbols: string[]): Promise<void> {
  const symbolToId = new Map<string, string>();
  for (const symbol of symbols) {
    try {
      symbolToId.set(symbol, coinId(symbol));
    } catch (e) {
      if (!(e instanceof ProviderError)) throw e;
      await recordFailureStandalone("coingecko", symbol, e.message);
    }
  }
  if (symbolToId.size === 0) return;

  const ids = [...new Set(symbolToId.values())].sort();
  let quotesById: Record<string, { price: number; volume: number | null }>;
  try {
    quotesById = await getQuotesByIds(ids);
  } catch (e) {
    console.warn(`refresh_tracked_universe: crypto bulk refresh failed: ${(e as Error).message}`);
    for (const symbol of symbolToId.keys()) {
      await recordFailureStandalone("coingecko", symbol, (e as Error).message);
    }
    return;
  }

  const now = new Date();
  let quoted = 0;
  let failed = 0;
  for (const [symbol, id] of symbolToId) {
    const data = quotesById[id];
    if (!data) {
      failed += 1;
      await recordFailureStandalone("coingecko", symbol, `no quote returned by CoinGecko bulk refresh for id ${id}`);
      continue;
    }
    const quote: NormalizedQuote = { symbol, provider: "coingecko", timestamp: now, price: data.price, volume: data.volume, currency: null };
    const assetId = await saveQuote("coingecko", quote);
    await prisma.$transaction((tx) => recordPriceHistory(tx, assetId, symbol, data.price, now));
    await cacheQuote(symbol, quote as unknown as Record<string, unknown>);
    quoted += 1;
  }

  console.log(`refresh_tracked_universe: crypto bulk — quoted=${quoted} failed=${failed} of ${symbolToId.size}`);
}

/** Standalone version of ingestionRepo.recordFailure — the crypto-bulk path
 * isn't already inside a transaction the way ingestQuote's failure path is,
 * so it opens its own short transaction per call, matching Python's
 * per-symbol record_failure + immediate commit inside the loop. */
async function recordFailureStandalone(providerName: string, symbol: string, error: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await getOrCreateProvider(tx, providerName);
      await recordFailure(tx, providerName, symbol, error);
    });
  } catch {
    // Matches Python: record_failure errors inside this loop must not abort the batch.
  }
}

/** Port of refresh_tracked_universe_task's _run. Daily refresh for is_tracked
 * assets NOT already covered by the hourly held/watchlisted refresh
 * (refreshAllQuotes) — kept on its own, much slower cadence specifically so
 * a large tracked universe never adds hourly load to that hot path. */
async function refreshTrackedUniverse(): Promise<void> {
  const assets = await listTrackedSymbolsForRefresh();
  if (assets.length === 0) {
    console.log("refresh_tracked_universe: nothing tracked yet, skipping");
    return;
  }

  const cryptoSymbols = assets
    .filter(({ symbol, assetClass }) => (assetClass === "crypto" || assetClass === "stablecoin") && !skipQuoteIngestion(symbol, assetClass))
    .map(({ symbol }) => symbol);
  if (cryptoSymbols.length > 0) {
    await refreshTrackedCryptoBulk(cryptoSymbols);
  }

  for (const { symbol, assetClass } of assets) {
    if (assetClass === "crypto" || assetClass === "stablecoin") continue;
    if (skipQuoteIngestion(symbol, assetClass)) continue;
    const providerName = resolveQuoteProvider(symbol, assetClass);
    await quotesQueue.add("ingestQuote", { providerName, symbol });
  }
}

/** Port of refresh_tracked_universe_task (the @_skip_if_disabled /
 * @shared_task decorator pair). Manual-trigger entrypoint only this phase —
 * no BullMQ repeatable schedule is registered anywhere (see Phase 3/4's
 * concurrent-writer decision). */
export async function refreshTrackedUniverseTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("refresh_tracked_universe", logId)) return;
  await wrapJobExecution("refresh_tracked_universe", logId, refreshTrackedUniverse);
}

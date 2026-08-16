import { prisma } from "../prisma";
import { ProviderError } from "../lib/errors";
import { QUOTE_FALLBACK_CANDIDATES, isNonUsExchangeSymbol, yahooCanServeCryptoSymbol } from "../lib/marketProviders/routing";
import { cacheQuote } from "../lib/marketProviders/redisRateLimit";
import { watchlistAlertsQueue } from "../lib/jobs/queues";
import { getOrCreateProvider, recordFailure, saveQuote, markProviderDegraded, isSymbolHeld } from "../lib/jobs/ingestionRepo";
import { processAssetSnapshot } from "./processAssetSnapshot";
import type { NormalizedQuote } from "../lib/marketProviders/types";
import * as yahoo from "../lib/marketProviders/yahoo";
import * as finnhub from "../lib/marketProviders/finnhub";
import * as twelvedata from "../lib/marketProviders/twelvedata";
import * as alphavantage from "../lib/marketProviders/alphavantage";
import * as coingecko from "../lib/marketProviders/coingecko";
import * as nseDirect from "../lib/marketProviders/nseDirect";
import * as binancePrice from "../lib/marketProviders/binancePrice";
import * as polygon from "../lib/marketProviders/polygon";

// Port of _MARKET_DATA_PROVIDERS — the full provider-name validation surface.
const MARKET_DATA_PROVIDERS = new Set([
  "finnhub", "polygon", "yahoo", "binance_price", "nse_direct", "twelvedata", "alphavantage", "coingecko",
]);

const ADAPTERS: Record<string, { getQuote(symbol: string): Promise<NormalizedQuote> } | undefined> = {
  yahoo,
  finnhub,
  twelvedata,
  alphavantage,
  coingecko,
  nse_direct: nseDirect,
  binance_price: binancePrice,
  polygon,
};

async function getQuoteFor(providerName: string, symbol: string): Promise<NormalizedQuote> {
  const adapter = ADAPTERS[providerName];
  if (!adapter) {
    throw new ProviderError(`${providerName}: no Node adapter ported yet (Phase 2/3 scope gap)`);
  }
  return adapter.getQuote(symbol);
}

/** Pure candidate-assembly core of ingest_quote — primary provider + its
 * fallback candidates (routing.ts's QUOTE_FALLBACK_CANDIDATES), minus the
 * coingecko/non-curated-crypto strip and the non-US-exchange/finnhub strip.
 * Excludes the DB-config availability filter (isProviderAvailable) so it's
 * cheap to test without a database. */
export function buildCandidateNames(providerName: string, symbol: string): string[] {
  let candidateNames = [providerName, ...(QUOTE_FALLBACK_CANDIDATES[providerName] ?? [])];
  if (providerName === "coingecko" && !yahooCanServeCryptoSymbol(symbol)) {
    candidateNames = candidateNames.filter((c) => c !== "yahoo");
  }
  if (isNonUsExchangeSymbol(symbol)) {
    candidateNames = candidateNames.filter((c) => c !== "finnhub");
  }
  return candidateNames;
}

/** Port of ProviderFactory.get_fallback_chain's DB-config filter — skips a
 * candidate that's explicitly disabled or not-yet-implemented in
 * provider_configs, without even attempting it (a row-less provider, e.g.
 * one never configured, is treated as available — same as Python's "no DB
 * row -> return the bare instance"). */
async function isProviderAvailable(providerName: string): Promise<boolean> {
  const cfg = await prisma.providerConfig.findUnique({ where: { providerName } });
  if (!cfg) return true;
  return cfg.enabled && cfg.status !== "PLANNED" && cfg.status !== "DISABLED";
}

/** Port of ingest_quote. Wires routing.ts's candidate-assembly predicates
 * into a real fetch-and-persist implementation: primary provider + its
 * fallback candidates, minus the coingecko/non-curated-crypto strip and the
 * non-US-exchange/finnhub strip, tried in order until one succeeds. Runs the
 * downstream asset-evaluation chain (processAssetSnapshot ->
 * generateFeatures -> generateSignals -> generateScores -> computeAssetHealth)
 * in-process for held symbols only, mirroring Python's
 * `is_symbol_held` gate — matches Python's decoupled failure semantics
 * (process_asset_snapshot.delay() there is fire-and-forget, so a downstream
 * evaluation failure never fails ingest_quote itself or gets misattributed
 * to the quote provider) even though this port awaits the chain directly
 * rather than dispatching a separate queue job for it — see
 * task2-step6-report.md for why in-process was chosen over queued. Does
 * dispatch evaluate_watchlist_alerts (Phase 5), mirroring Python's
 * evaluate_watchlist_alerts.delay(symbol) call right after cache_quote. */
export async function ingestQuote(providerName: string, symbol: string): Promise<boolean> {
  if (!MARKET_DATA_PROVIDERS.has(providerName)) {
    throw new ProviderError(`Unknown provider ${providerName}`);
  }

  const candidateNames = buildCandidateNames(providerName, symbol);

  const chain: string[] = [];
  for (const name of candidateNames) {
    if (await isProviderAvailable(name)) chain.push(name);
  }
  if (chain.length === 0) {
    throw new ProviderError(`No available provider for '${providerName}' or its fallbacks`);
  }

  let lastAttemptedProvider = providerName;
  let quote: NormalizedQuote | null = null;
  let lastError: Error | null = null;

  try {
    for (const name of chain) {
      lastAttemptedProvider = name;
      try {
        quote = await getQuoteFor(name, symbol);
        break;
      } catch (e) {
        if (!(e instanceof ProviderError)) throw e;
        lastError = e;
      }
    }
    if (!quote) {
      throw lastError ?? new ProviderError(`All providers failed for ${symbol}`);
    }

    const usedProvider = quote.provider;
    const assetId = await saveQuote(usedProvider, quote);

    await cacheQuote(symbol, quote as unknown as Record<string, unknown>);

    await watchlistAlertsQueue.add("evaluateWatchlistAlerts", { symbol });

    // Downstream evaluation chain, gated on held (not merely watchlisted) —
    // deliberately outside the outer try/catch's failure-attribution path:
    // a failure here (including the isSymbolHeld positions-table read, not
    // just processAssetSnapshot itself) must never be recorded as a provider
    // failure (record_failure/markProviderDegraded below), matching Python's
    // process_asset_snapshot.delay() being a decoupled, fire-and-forget
    // dispatch rather than part of ingest_quote's own success/failure — and
    // going one step further than Python, whose is_symbol_held call sits
    // unprotected before the .delay() dispatch and so would misattribute a
    // positions-table read failure to the provider.
    try {
      if (await isSymbolHeld(symbol)) await processAssetSnapshot(assetId);
    } catch (e) {
      console.error(`ingestQuote: evaluation chain failed for held symbol=${symbol}:`, e);
    }

    return true;
  } catch (e) {
    const providerNameForFailure = lastAttemptedProvider;
    const errorMessage = (e as Error).message;
    try {
      const { providerId } = await prisma.$transaction(async (tx) => {
        const provider = await getOrCreateProvider(tx, providerNameForFailure);
        await recordFailure(tx, providerNameForFailure, symbol, errorMessage);
        return { providerId: provider.id };
      });
      await markProviderDegraded(providerId);
    } catch {
      // Matches Python: record_failure/mark_provider_degraded errors are swallowed.
    }
    throw e;
  }
}

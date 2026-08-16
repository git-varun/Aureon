import { v5 as uuidv5 } from "uuid";
import { QUOTE_FALLBACK_CANDIDATES, yahooCanServeCryptoSymbol } from "../marketProviders/routing";
import { getPriceHistory as getYahooPriceHistory } from "../marketProviders/yahoo";
import { getPriceHistory as getNsePriceHistory } from "../marketProviders/nseDirect";
import { bulkInsertPriceHistory, type PriceHistoryRow } from "../jobs/ingestionRepo";

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

interface HistoryRow {
  timestamp: Date;
  close: number;
  volume: number | null;
}

// Candidate-name -> Node price-history function. Only yahoo/nse_direct have
// a real getPriceHistory port today (coingecko/finnhub/twelvedata/
// alphavantage do not — a pre-existing Node provider-coverage gap, not
// something this port expands scope to close). A candidate absent from this
// map is simply skipped, same observable effect as Python's provider
// throwing ProviderError on every attempt: the chain moves to the next
// candidate, and backfillHistory returns 0 rows if none work.
const HISTORY_PROVIDERS: Partial<Record<string, (symbol: string, period: string, interval: string) => Promise<HistoryRow[]>>> = {
  yahoo: getYahooPriceHistory,
  nse_direct: getNsePriceHistory,
};

/** Port of IndexUniverseSeedService.backfill_history. Called after a symbol
 * is newly quoted/tracked (resolveAndTrackSymbol, seed_equity_universes,
 * seed_crypto_top100 in Python) to backfill 3 months of daily history in one
 * shot, so the symbol has chart data immediately instead of waiting for the
 * regular ingestion pipeline to accumulate it day by day. Tries each
 * fallback candidate for providerName in order, same
 * QUOTE_FALLBACK_CANDIDATES ordering ingestQuote uses, with the same
 * coingecko-can't-serve-non-curated-symbol exclusion. Returns the number of
 * rows inserted (0 if every candidate failed or returned nothing). */
export async function backfillHistory(assetId: string, symbol: string, providerName: string): Promise<number> {
  let candidateNames = [providerName, ...(QUOTE_FALLBACK_CANDIDATES[providerName] ?? [])];
  if (providerName === "coingecko" && !yahooCanServeCryptoSymbol(symbol)) {
    candidateNames = candidateNames.filter((c) => c !== "yahoo");
  }

  for (const candidate of candidateNames) {
    const fn = HISTORY_PROVIDERS[candidate];
    if (!fn) continue;
    try {
      const histRows = await fn(symbol, "3mo", "1d");
      if (histRows.length === 0) continue;
      const rows: PriceHistoryRow[] = histRows.map((r) => ({
        id: uuidv5(`${symbol}-${r.timestamp.toISOString().slice(0, 10)}`, UUID_NAMESPACE_DNS),
        assetId,
        symbol,
        price: r.close,
        volume: r.volume,
        timestamp: r.timestamp,
      }));
      await bulkInsertPriceHistory(rows);
      return rows.length;
    } catch (e) {
      console.warn(`backfillHistory: history failed for ${symbol} via ${candidate}: ${(e as Error).message}`);
    }
  }
  return 0;
}

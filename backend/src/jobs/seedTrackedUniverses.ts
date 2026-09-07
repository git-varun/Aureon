import { SEED_UNIVERSES } from "../lib/market/seedUniverses";
import { backfillHistory } from "../lib/market/backfillHistory";
import { resolveQuoteProvider } from "../lib/marketProviders/routing";
import { ingestQuote } from "./ingestQuote";
import { ensureTrackedAsset, saveQuote } from "../lib/jobs/ingestionRepo";
import { getTopMarketCapCoins, SYMBOL_TO_COINGECKO_ID } from "../lib/marketProviders/coingecko";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";
import type { NormalizedQuote } from "../lib/marketProviders/types";
import { logger } from "../lib/logger";

interface UniverseResult {
  symbols: number;
  quoted: number;
  failed: number;
  history_rows: number;
}

/** Port of IndexUniverseSeedService.seed_equity_universes — walks each
 * SEED_UNIVERSES list, creates/tracks the Asset, quotes it, and backfills
 * history. */
async function seedEquityUniverses(): Promise<Record<string, UniverseResult>> {
  const results: Record<string, UniverseResult> = {};
  for (const [universeName, symbols] of Object.entries(SEED_UNIVERSES)) {
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
  }
  return results;
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
async function seedCryptoTop100(limit = 100): Promise<UniverseResult> {
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

  const result: UniverseResult = { symbols: coins.length, quoted, failed, history_rows: historyRows };
  logger.info({ job: "seed_tracked_universes", universeName: "crypto_top100", ...result }, "universe seeded");
  return result;
}

/** Port of IndexUniverseSeedService.seed_tracked_universes. */
async function seedTrackedUniverses(): Promise<Record<string, UniverseResult>> {
  const results = await seedEquityUniverses();
  results.crypto_top100 = await seedCryptoTop100();
  logger.info({ job: "seed_tracked_universes", results }, "completed");
  return results;
}

/** Port of seed_tracked_universes_task (the @_skip_if_disabled /
 * @shared_task decorator pair). Rare/manual "Run Now" job — enabled=False by
 * default (see jobDefaults.ts), no BullMQ repeatable schedule registered
 * anywhere — one-time (or occasional) bulk operation, unlike every other
 * JobConfig entry. */
export async function seedTrackedUniversesTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("seed_tracked_universes", logId)) return;
  await wrapJobExecution("seed_tracked_universes", logId, seedTrackedUniverses);
}

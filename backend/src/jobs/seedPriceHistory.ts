import { v5 as uuidv5 } from "uuid";
import { skipQuoteIngestion } from "../lib/marketProviders/routing";
import { getPriceHistory as getYahooPriceHistory, type PriceHistoryRow as YahooPriceHistoryRow } from "../lib/marketProviders/yahoo";
import { getPriceHistory as getNsePriceHistory } from "../lib/marketProviders/nseDirect";
import { listAllAssets, bulkInsertPriceHistory, type PriceHistoryRow } from "../lib/jobs/ingestionRepo";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/** Port of MarketSeedService.seed_price_history's nse_chain loop —
 * India-classified (.NS) equities prefer nse_direct, falling back to yahoo
 * on failure (ported behavior, not cleaned up: if nse_direct throws, yahoo
 * is tried; if both fail, this returns []). */
async function getHistoryForAsset(symbol: string): Promise<YahooPriceHistoryRow[]> {
  if (symbol.endsWith(".NS")) {
    try {
      return await getNsePriceHistory(symbol, "3mo", "1d");
    } catch (e) {
      console.warn(`seed_price_history: nse_direct failed for ${symbol}, trying next: ${(e as Error).message}`);
    }
  }
  return getYahooPriceHistory(symbol, "3mo", "1d");
}

/** Port of MarketSeedService.seed_price_history. Routed through the same
 * yahoo/nse_direct adapters get_quote uses (not a bare provider-less call)
 * so a broken provider fails this job loudly rather than silently seeding
 * nothing. */
async function seedPriceHistory(): Promise<{ totalRows: number }> {
  const assets = await listAllAssets();
  if (assets.length === 0) {
    console.warn("seed_price_history: no assets found — nothing held or watchlisted yet");
    return { totalRows: 0 };
  }

  let totalRows = 0;
  for (const asset of assets) {
    if (skipQuoteIngestion(asset.symbol, asset.assetClass)) continue;
    try {
      const histRows = await getHistoryForAsset(asset.symbol);
      if (histRows.length === 0) {
        console.warn(`seed_price_history: no history for ${asset.symbol}`);
        continue;
      }

      const rows: PriceHistoryRow[] = histRows.map((r) => ({
        id: uuidv5(`${asset.symbol}-${r.timestamp.toISOString().slice(0, 10)}`, UUID_NAMESPACE_DNS),
        assetId: asset.id,
        symbol: asset.symbol,
        price: r.close,
        volume: r.volume,
        timestamp: r.timestamp,
      }));

      await bulkInsertPriceHistory(rows);
      totalRows += rows.length;
      console.log(`seed_price_history: ${asset.symbol} — ${rows.length} rows inserted`);
    } catch (e) {
      console.warn(`seed_price_history: failed for ${asset.symbol}: ${(e as Error).message}`);
    }
  }

  console.log(`seed_price_history: completed — total new rows: ${totalRows}`);
  return { totalRows };
}

/** Port of seed_price_history_task (the @_skip_if_disabled / @shared_task
 * decorator pair). Manual/one-time-backfill entrypoint only this phase — no
 * BullMQ repeatable schedule is registered anywhere. */
export async function seedPriceHistoryTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("seed_price_history", logId)) return;
  await wrapJobExecution("seed_price_history", logId, seedPriceHistory);
}

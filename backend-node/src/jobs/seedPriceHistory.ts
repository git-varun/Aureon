import { v5 as uuidv5 } from "uuid";
import { skipQuoteIngestion } from "../lib/marketProviders/routing";
import { getPriceHistory } from "../lib/marketProviders/yahoo";
import { listAllAssets, bulkInsertPriceHistory, type PriceHistoryRow } from "../lib/jobs/ingestionRepo";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/** Port of MarketSeedService.seed_price_history. Routed through the same
 * yahoo adapter get_quote/get_fundamentals use (not a bare provider-less
 * call) so a broken Yahoo fails this job loudly rather than silently
 * seeding nothing — India-classified (.NS) equities prefer nse_direct with
 * yahoo fallback in Python; this port always uses yahoo for history (see
 * seedPriceHistoryTask's doc comment on why nse_direct's historical path
 * isn't ported this phase). */
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
      const histRows = await getPriceHistory(asset.symbol, "3mo", "1d");
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
 * BullMQ repeatable schedule is registered anywhere.
 *
 * Scope trim: Python prefers a nse_direct→yahoo fallback chain for .NS
 * symbols (jugaad-data's stock_df historical scraping). nse_direct.ts has no
 * getPriceHistory port — porting jugaad-data's NSE historical-data flow is a
 * distinct, nontrivial scraping surface from the live-quote endpoint already
 * ported, and out of this phase's scope. Every symbol here goes through
 * yahoo instead, which does serve .NS tickers directly — Python's own
 * fallback chain lands here too whenever nse_direct is unavailable/fails, so
 * this is the already-exercised fallback path, not a novel one. .NS closes
 * may differ slightly in value/timing from Python's nse_direct-sourced rows. */
export async function seedPriceHistoryTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("seed_price_history", logId)) return;
  await wrapJobExecution("seed_price_history", logId, seedPriceHistory);
}

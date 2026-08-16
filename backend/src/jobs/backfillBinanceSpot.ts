import { BinanceClient } from "../lib/broker/binance/client";
import { backfillBinanceSpot } from "../lib/broker/brokerSync";
import { invalidatePortfolioCaches } from "../lib/portfolioCache";
import { resolveProviderCredentials } from "../lib/broker/runBrokerSync";
import { BinanceAuthError, ConfigurationError, ValidationError } from "../lib/errors";
import { wrapJobExecution } from "../lib/jobs/wrapJobExecution";

/** Port of _run_binance_spot_backfill. One-time, user-triggered full-history
 * Spot trade backfill for a single portfolio (resumable via
 * BinanceBackfillProgress checkpoints — see backfillBinanceSpot in
 * brokerSync.ts). */
async function runBackfillBinanceSpot(portfolioId: string | null): Promise<void> {
  if (!portfolioId) throw new ValidationError("backfill_binance_spot: portfolio_id is required");

  const creds = await resolveProviderCredentials("binance", ["api_key", "api_secret"]);
  if (creds === null) {
    throw new ConfigurationError("Provider 'binance' is not configured — job not dispatched");
  }
  if (!creds.api_key || !creds.api_secret) {
    throw new BinanceAuthError("AUTH_REQUIRED: Binance api_key/api_secret not configured");
  }
  const client = new BinanceClient(creds.api_key, creds.api_secret);

  const summary = await backfillBinanceSpot(portfolioId, client);
  await invalidatePortfolioCaches(portfolioId);
  console.log(`backfill_binance_spot: portfolio=${portfolioId} ${JSON.stringify(summary)}`);
}

/** Port of backfill_binance_spot_task. */
export async function backfillBinanceSpotTask(logId: number, portfolioId: string | null = null): Promise<void> {
  await wrapJobExecution("backfill_binance_spot", logId, () => runBackfillBinanceSpot(portfolioId));
}

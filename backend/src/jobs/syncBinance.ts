import { prisma } from "../prisma";
import { BinanceClient, fetchBinanceSyncData } from "../lib/broker/binance/client";
import { syncBinanceHoldings } from "../lib/broker/brokerSync";
import { invalidatePortfolioCaches } from "../lib/portfolioCache";
import { resolveProviderCredentials, applyHoldingsToAllPortfolios, refreshQuotesAndSnapshots, lastBrokerTradeAt, lastTransactionAt } from "../lib/broker/runBrokerSync";
import { BinanceAuthError } from "../lib/errors";
import { wrapJobExecution } from "../lib/jobs/wrapJobExecution";
import { logger } from "../lib/logger";

/** Port of _run_broker_sync("sync_binance", "binance", "sync_binance_holdings"). */
async function runSyncBinance(): Promise<void> {
  const creds = await resolveProviderCredentials("binance", ["api_key", "api_secret"]);
  if (creds === null) {
    logger.warn({ job: "sync_binance", provider: "binance" }, "skipped — provider is not configured/enabled");
    return;
  }

  // Mirrors BinanceBrokerProvider.authenticate: requires both api_key AND
  // api_secret, else the client stays unbuilt.
  if (!creds.api_key || !creds.api_secret) {
    throw new BinanceAuthError("AUTH_REQUIRED: Binance api_key/api_secret not configured");
  }
  const client = new BinanceClient(creds.api_key, creds.api_secret);

  const since = await lastBrokerTradeAt("binance");
  const [incomeSince, depositsSince, withdrawalsSince, dividendsSince] = await Promise.all([
    lastTransactionAt("binance", "broker_income"),
    lastTransactionAt("binance", "broker_transfer"),
    lastTransactionAt("binance", "broker_transfer"),
    lastTransactionAt("binance", "broker_dividend"),
  ]);
  const holdings = await fetchBinanceSyncData(client, since ? since.getTime() : null, {
    income: incomeSince ? incomeSince.getTime() : null,
    deposits: depositsSince ? depositsSince.getTime() : null,
    withdrawals: withdrawalsSince ? withdrawalsSince.getTime() : null,
    dividends: dividendsSince ? dividendsSince.getTime() : null,
  }); // raises BinanceAuthError("AUTH_REQUIRED: ...") if key/secret bad

  await applyHoldingsToAllPortfolios("sync_binance", async (portfolioId) => {
    const result = await prisma.$transaction((tx) => syncBinanceHoldings(tx, portfolioId, holdings));
    await invalidatePortfolioCaches(portfolioId);
    return result;
  });

  await refreshQuotesAndSnapshots("sync_binance");
}

/** Port of sync_binance_task. */
export async function syncBinanceTask(logId: number): Promise<void> {
  await wrapJobExecution("sync_binance", logId, runSyncBinance);
}

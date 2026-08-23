import { prisma } from "../prisma";
import { BinanceClient, fetchBinanceSyncData } from "../lib/broker/binance/client";
import { syncBinanceHoldings, resolveTransferPrices } from "../lib/broker/brokerSync";
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
  // One watermark per independently-accumulating stream. Deposits and
  // withdrawals share kind="broker_transfer" and USDⓈ-M/COIN-M income share
  // kind="broker_income", so those must be narrowed further — otherwise a
  // transient failure on one endpoint has its missed window permanently
  // closed by its sibling's newer rows.
  const [incomeUsdmSince, incomeCoinmSince, depositsSince, withdrawalsSince, dividendsSince] = await Promise.all([
    lastTransactionAt("binance", "broker_income", { wallet: "futures_usdm" }),
    lastTransactionAt("binance", "broker_income", { wallet: "futures_coinm" }),
    lastTransactionAt("binance", "broker_transfer", { transactionType: "DEPOSIT" }),
    lastTransactionAt("binance", "broker_transfer", { transactionType: "WITHDRAWAL" }),
    lastTransactionAt("binance", "broker_dividend"),
  ]);
  const holdings = await fetchBinanceSyncData(client, since ? since.getTime() : null, {
    incomeUsdm: incomeUsdmSince ? incomeUsdmSince.getTime() : null,
    incomeCoinm: incomeCoinmSince ? incomeCoinmSince.getTime() : null,
    deposits: depositsSince ? depositsSince.getTime() : null,
    withdrawals: withdrawalsSince ? withdrawalsSince.getTime() : null,
    dividends: dividendsSince ? dividendsSince.getTime() : null,
  }); // raises BinanceAuthError("AUTH_REQUIRED: ...") if key/secret bad

  // Resolved once, outside every transaction: these are throttled CoinGecko
  // network calls that would otherwise run per-portfolio inside
  // prisma.$transaction's 5s window.
  const transferPrices = await resolveTransferPrices(holdings.deposits ?? [], holdings.withdrawals ?? []);

  await applyHoldingsToAllPortfolios("sync_binance", async (portfolioId) => {
    const result = await prisma.$transaction((tx) => syncBinanceHoldings(tx, portfolioId, holdings, transferPrices));
    await invalidatePortfolioCaches(portfolioId);
    return result;
  });

  await refreshQuotesAndSnapshots("sync_binance");
}

/** Port of sync_binance_task. */
export async function syncBinanceTask(logId: number): Promise<void> {
  await wrapJobExecution("sync_binance", logId, runSyncBinance);
}

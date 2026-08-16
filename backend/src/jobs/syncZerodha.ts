import { prisma } from "../prisma";
import { ZerodhaClient } from "../lib/broker/zerodha/client";
import { syncZerodhaHoldings } from "../lib/broker/brokerSync";
import { invalidatePortfolioCaches } from "../lib/portfolioCache";
import { resolveProviderCredentials, applyHoldingsToAllPortfolios, refreshQuotesAndSnapshots } from "../lib/broker/runBrokerSync";
import { ZerodhaAuthError } from "../lib/errors";
import { wrapJobExecution } from "../lib/jobs/wrapJobExecution";

/** Port of _run_broker_sync("sync_zerodha", "zerodha", "sync_zerodha_holdings"). */
async function runSyncZerodha(): Promise<void> {
  const creds = await resolveProviderCredentials("zerodha", ["api_key", "api_secret", "access_token"]);
  if (creds === null) {
    console.warn("sync_zerodha: skipped — zerodha provider is not configured/enabled");
    return;
  }

  // Mirrors ZerodhaBrokerProvider.authenticate: no-op (client stays
  // unbuilt) when api_key is absent, so getHoldings below raises
  // AUTH_REQUIRED the same way provider.sync() does in Python.
  if (!creds.api_key) {
    throw new ZerodhaAuthError("AUTH_REQUIRED: Zerodha is not connected");
  }
  const client = new ZerodhaClient(creds.api_key, creds.api_secret, creds.access_token);
  const holdings = await client.getHoldings(); // raises ZerodhaAuthError("AUTH_REQUIRED: ...") if not connected/expired

  await applyHoldingsToAllPortfolios("sync_zerodha", async (portfolioId) => {
    const result = await prisma.$transaction((tx) => syncZerodhaHoldings(tx, portfolioId, holdings));
    await invalidatePortfolioCaches(portfolioId);
    return result;
  });

  await refreshQuotesAndSnapshots("sync_zerodha");
}

/** Port of sync_zerodha_task. */
export async function syncZerodhaTask(logId: number): Promise<void> {
  await wrapJobExecution("sync_zerodha", logId, runSyncZerodha);
}

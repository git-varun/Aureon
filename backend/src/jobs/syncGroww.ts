import { prisma } from "../prisma";
import { GrowwClient } from "../lib/broker/groww/client";
import { syncGrowwHoldings } from "../lib/broker/brokerSync";
import { invalidatePortfolioCaches } from "../lib/portfolioCache";
import { resolveProviderCredentials, applyHoldingsToAllPortfolios, refreshQuotesAndSnapshots } from "../lib/broker/runBrokerSync";
import { GrowwAuthError } from "../lib/errors";
import { wrapJobExecution } from "../lib/jobs/wrapJobExecution";

/** Port of _run_broker_sync("sync_groww", "groww", "sync_groww_holdings"). */
async function runSyncGroww(): Promise<void> {
  const creds = await resolveProviderCredentials("groww", ["api_key", "api_secret"]);
  if (creds === null) {
    console.warn("sync_groww: skipped — groww provider is not configured/enabled");
    return;
  }

  // Mirrors GrowwBrokerProvider.authenticate: requires both api_key AND
  // api_secret, else the client stays unbuilt.
  if (!creds.api_key || !creds.api_secret) {
    throw new GrowwAuthError("AUTH_REQUIRED: Groww api_key/api_secret not configured");
  }
  const client = new GrowwClient(creds.api_key, creds.api_secret);
  const holdings = await client.getHoldings(); // raises GrowwAuthError("AUTH_REQUIRED: ...") if session rejected

  await applyHoldingsToAllPortfolios("sync_groww", async (portfolioId) => {
    const result = await prisma.$transaction((tx) => syncGrowwHoldings(tx, portfolioId, holdings));
    await invalidatePortfolioCaches(portfolioId);
    return result;
  });

  await refreshQuotesAndSnapshots("sync_groww");
}

/** Port of sync_groww_task. */
export async function syncGrowwTask(logId: number): Promise<void> {
  await wrapJobExecution("sync_groww", logId, runSyncGroww);
}

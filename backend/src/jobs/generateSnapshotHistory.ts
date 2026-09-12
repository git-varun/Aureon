import { prisma } from "../prisma";
import { generatePortfolioSnapshot } from "../lib/snapshot";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";
import { ProviderError } from "../lib/errors";
import { logger } from "../lib/logger";

/** Daily job: nothing else runs valuation on a timer, so snapshot_history
 * (see snapshot.ts's generatePortfolioSnapshot) only otherwise fills on days
 * a user manually acts or a broker sync happens to fire. Iterates every
 * portfolio, matching the except-and-continue loop other multi-portfolio
 * jobs use (runBrokerSync.ts's refreshQuotesAndSnapshots) — one bad
 * portfolio must not abort the others. Escalates only if every portfolio
 * failed this cycle (same convention as refreshFundamentals.ts) — otherwise
 * a down price provider would write zero history rows while the job still
 * logs SUCCESS, and nothing else ever inspects this table closely enough to
 * notice. */
async function generateSnapshotHistory(): Promise<{ portfolios: number; failed: number }> {
  const portfolios = await prisma.portfolio.findMany({ select: { id: true } });
  let failed = 0;
  for (const { id: portfolioId } of portfolios) {
    try {
      await generatePortfolioSnapshot(portfolioId);
    } catch (e) {
      logger.warn({ job: "generate_snapshot_history", portfolioId, err: e }, "snapshot failed");
      failed += 1;
    }
  }

  if (portfolios.length > 0 && failed === portfolios.length) {
    throw new ProviderError(`generate_snapshot_history: all ${portfolios.length} portfolio(s) failed this cycle`);
  }

  return { portfolios: portfolios.length, failed };
}

export async function generateSnapshotHistoryTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("generate_snapshot_history", logId)) return;
  await wrapJobExecution("generate_snapshot_history", logId, generateSnapshotHistory);
}

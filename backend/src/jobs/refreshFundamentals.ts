import { prisma } from "../prisma";
import { ProviderError } from "../lib/errors";
import { getFundamentals } from "../lib/marketProviders/yahoo";
import { listEquityAssetsWithQuotes, updateAssetSector } from "../lib/jobs/ingestionRepo";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";
import { logger } from "../lib/logger";

/** Port of refresh_fundamentals_task's _run. Daily job: refreshes trailing
 * PE/price-to-book/ROE/etc for every quoted equity via Yahoo, and rides
 * sector/industry along on the same call into Asset.metadata (see
 * update_asset_sector's docstring — same ticker.info/quoteSummary call this
 * task already makes, no extra request). No with_retry wrapper here, unlike
 * Python's _get_fundamentals_with_retry — Node's sibling jobs (e.g.
 * refresh_mutual_fund_navs' getAllNavs call) already established the
 * precedent of skipping that decorator in this port; getFundamentals's own
 * try/catch still surfaces a real ProviderError per symbol. */
async function refreshFundamentals(): Promise<void> {
  const assets = await listEquityAssetsWithQuotes();
  if (assets.length === 0) {
    logger.warn({ job: "refresh_fundamentals" }, "no quoted equities found");
    return;
  }

  const failed: string[] = [];
  for (const { id: assetId, symbol } of assets) {
    try {
      const fundamentals = await getFundamentals(symbol);
      const now = new Date();
      await prisma.assetFundamentals.upsert({
        where: { assetId },
        create: {
          assetId,
          trailingPe: (fundamentals.trailing_pe as number | null) ?? null,
          priceToBook: (fundamentals.price_to_book as number | null) ?? null,
          roe: (fundamentals.roe as number | null) ?? null,
          debtToEquity: (fundamentals.debt_to_equity as number | null) ?? null,
          profitMargin: (fundamentals.profit_margin as number | null) ?? null,
          revenueGrowth: (fundamentals.revenue_growth as number | null) ?? null,
          dividendYield: (fundamentals.dividend_yield as number | null) ?? null,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          trailingPe: (fundamentals.trailing_pe as number | null) ?? null,
          priceToBook: (fundamentals.price_to_book as number | null) ?? null,
          roe: (fundamentals.roe as number | null) ?? null,
          debtToEquity: (fundamentals.debt_to_equity as number | null) ?? null,
          profitMargin: (fundamentals.profit_margin as number | null) ?? null,
          revenueGrowth: (fundamentals.revenue_growth as number | null) ?? null,
          dividendYield: (fundamentals.dividend_yield as number | null) ?? null,
          updatedAt: now,
        },
      });
      await updateAssetSector(assetId, fundamentals.sector as string | null, fundamentals.industry as string | null);
    } catch (e) {
      // Isolated per-symbol failure (e.g. no fundamentals coverage for this
      // ticker) shouldn't abort the whole daily run — only escalate if every
      // symbol this cycle failed outright (below).
      logger.warn({ job: "refresh_fundamentals", symbol, err: e }, "failed for symbol");
      failed.push(symbol);
    }
  }

  if (failed.length === assets.length) {
    throw new ProviderError(`refresh_fundamentals_task: all ${assets.length} symbol(s) had total provider failure this cycle`);
  }
}

/** Port of refresh_fundamentals_task (the @_skip_if_disabled / @shared_task
 * decorator pair). Beat-scheduled in Python (crontab(hour=6, minute=0) UTC)
 * — cut over to a real BullMQ repeatable schedule, see scripts/startWorker.ts
 * and queue.ts's SCHEDULED_JOB_HANDLERS. */
export async function refreshFundamentalsTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("refresh_fundamentals", logId)) return;
  await wrapJobExecution("refresh_fundamentals", logId, refreshFundamentals);
}

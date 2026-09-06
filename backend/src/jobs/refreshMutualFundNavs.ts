import { prisma } from "../prisma";
import { ProviderError } from "../lib/errors";
import { getAllNavs } from "../lib/marketProviders/amfi";
import { listMutualFundAssetsWithQuotes, recordPriceHistory } from "../lib/jobs/ingestionRepo";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";
import { logger } from "../lib/logger";

/** Port of refresh_mutual_fund_navs_task's _run. Asset.symbol for a
 * mutual_fund asset is `{ISIN}_MF` when the importer resolved a real ISIN
 * (portfolio_importer.py's _mf_symbol_for, ISIN-preferred since the MF
 * orphan fix), or a name-slug `..._MF` fallback otherwise — only the
 * ISIN-keyed form can ever match AMFI's feed, same as Python. */
async function refreshMutualFundNavs(): Promise<void> {
  const assets = await listMutualFundAssetsWithQuotes();
  if (assets.length === 0) {
    logger.info({ job: "refresh_mutual_fund_navs" }, "no mutual fund holdings found");
    return;
  }

  const isinToNav = await getAllNavs();

  let matched = 0;
  const unmatched: string[] = [];
  const navTimestamp = new Date();

  await prisma.$transaction(async (tx) => {
    for (const { id: assetId, symbol } of assets) {
      const isin = symbol.endsWith("_MF") ? symbol.slice(0, -3) : symbol;
      const nav = isinToNav.get(isin);
      if (nav === undefined) {
        unmatched.push(symbol);
        continue;
      }
      await tx.latestQuote.upsert({
        where: { symbol },
        create: { symbol, assetId, price: nav, volume: null, provider: "amfi", createdAt: navTimestamp, updatedAt: navTimestamp },
        update: { price: nav, assetId, provider: "amfi", updatedAt: navTimestamp },
      });
      // Forward-only: latest_quotes always held today's real NAV, but
      // price_history was never appended before this fix, so day-over-day
      // change/charts/theme NAV compositing were permanently empty for
      // every mutual fund. No historical backfill is possible.
      await recordPriceHistory(tx, assetId, symbol, nav, navTimestamp);
      matched += 1;
    }
  });

  if (unmatched.length > 0) {
    logger.warn({ job: "refresh_mutual_fund_navs", unmatchedCount: unmatched.length, unmatched }, "no AMFI NAV match for symbol(s)");
  }
  logger.info({ job: "refresh_mutual_fund_navs", matched, total: assets.length }, "mutual fund NAV(s) updated");

  if (matched === 0) {
    throw new ProviderError("refresh_mutual_fund_navs_task: no AMFI NAV matched any held mutual fund symbol");
  }
}

/** Port of refresh_mutual_fund_navs_task (the @_skip_if_disabled /
 * @shared_task decorator pair). Manual-trigger entrypoint only this phase —
 * no BullMQ repeatable schedule is registered anywhere. */
export async function refreshMutualFundNavsTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("refresh_mutual_fund_navs", logId)) return;
  await wrapJobExecution("refresh_mutual_fund_navs", logId, refreshMutualFundNavs);
}

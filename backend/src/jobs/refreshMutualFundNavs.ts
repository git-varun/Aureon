import { prisma } from "../prisma";
import { getAllNavs } from "../lib/marketProviders/amfi";
import { listMutualFundAssetsWithQuotes, recordPriceHistory } from "../lib/jobs/ingestionRepo";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";
import { logger } from "../lib/logger";

/** Port of refresh_mutual_fund_navs_task's _run. Asset.symbol for a
 * mutual_fund asset is `{ISIN}_MF` when the importer resolved a real ISIN
 * (portfolio_importer.py's _mf_symbol_for, ISIN-preferred since the MF
 * orphan fix), or a name-slug `..._MF` fallback otherwise — only the
 * ISIN-keyed form can ever match AMFI's feed, same as Python. */
interface RefreshResult {
  matched: number;
  total: number;
  unmatched: string[];
  warning?: string;
}

async function refreshMutualFundNavs(): Promise<RefreshResult> {
  const assets = await listMutualFundAssetsWithQuotes();
  if (assets.length === 0) {
    logger.info({ job: "refresh_mutual_fund_navs" }, "no mutual fund holdings found");
    return { matched: 0, total: 0, unmatched: [] };
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

  // 0 matched is a structural coverage gap (held MF symbols are AMFI
  // scheme-code slugs, not the ISIN keys AMFI's feed is indexed by), not a
  // provider failure — succeed with a warning rather than a red FAILED row.
  // A genuine write error still throws: the upserts run inside the
  // $transaction above and propagate out of this function.
  const warning =
    matched === 0
      ? `0 of ${assets.length} held mutual fund assets matched the AMFI NAV feed (unmatched: ${unmatched.join(", ")})`
      : undefined;

  return { matched, total: assets.length, unmatched, warning };
}

/** Port of refresh_mutual_fund_navs_task (the @_skip_if_disabled /
 * @shared_task decorator pair). Manual-trigger entrypoint only this phase —
 * no BullMQ repeatable schedule is registered anywhere. */
export async function refreshMutualFundNavsTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("refresh_mutual_fund_navs", logId)) return;
  await wrapJobExecution("refresh_mutual_fund_navs", logId, refreshMutualFundNavs);
}

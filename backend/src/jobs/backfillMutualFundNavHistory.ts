import { v5 as uuidv5 } from "uuid";
import { prisma } from "../prisma";
import { Prisma } from "../generated/prisma";
import { getSchemeList, getSchemeHistory, searchSchemesByName, type MfapiSchemeListEntry } from "../lib/marketProviders/mfapi";
import { matchIsinToSchemeCode, matchNameToSchemeCode } from "../lib/jobs/mfSchemeMatch";
import { listHeldMutualFundAssets, bulkInsertPriceHistory, type PriceHistoryRow } from "../lib/jobs/ingestionRepo";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";
import { logger } from "../lib/logger";

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

type HeldMfAsset = { id: string; symbol: string; name: string; metadata: Record<string, unknown> | null };

interface ResolveResult {
  schemeCode: number | null;
  needsReview: boolean;
}

/** Resolves one held MF asset to an mfapi.in scheme code. ISIN-symbol assets
 * (`{ISIN}_MF` where the ISIN starts "INF") get an exact ISIN match against
 * the scheme list. Slug-only assets get a name search, but only a single
 * exact normalized-name match is auto-accepted; on a match, the resolved
 * scheme code + ISIN are stored in Asset.metadata (never in Asset.symbol —
 * see Global Constraints). */
async function resolveSchemeCode(asset: HeldMfAsset, schemeList: MfapiSchemeListEntry[]): Promise<ResolveResult> {
  const rawIsin = asset.symbol.endsWith("_MF") ? asset.symbol.slice(0, -3) : "";
  if (/^INF[A-Z0-9]{9}$/.test(rawIsin)) {
    return { schemeCode: matchIsinToSchemeCode(rawIsin, schemeList), needsReview: false };
  }

  const results = await searchSchemesByName(asset.name);
  const schemeCode = matchNameToSchemeCode(asset.name, results);
  if (schemeCode !== null) {
    const matchedEntry = schemeList.find((e) => e.schemeCode === schemeCode);
    const payload: Record<string, unknown> = {
      ...(asset.metadata ?? {}),
      amfiSchemeCode: schemeCode,
      ...(matchedEntry?.isinGrowth ? { isin: matchedEntry.isinGrowth } : {}),
    };
    await prisma.asset.update({ where: { id: asset.id }, data: { metadata: payload as Prisma.InputJsonValue } });
  }
  return { schemeCode, needsReview: schemeCode === null && results.length > 0 };
}

async function backfillMutualFundNavHistory(): Promise<{ resolved: number; needsReview: number; unmatched: number; totalRows: number; warning?: string }> {
  const assets = await listHeldMutualFundAssets();
  if (assets.length === 0) {
    logger.info({ job: "backfill_mutual_fund_nav_history" }, "no held mutual fund positions found");
    return { resolved: 0, needsReview: 0, unmatched: 0, totalRows: 0 };
  }

  const schemeList = await getSchemeList();

  let resolved = 0;
  let needsReview = 0;
  let unmatched = 0;
  let totalRows = 0;

  for (const asset of assets) {
    let schemeCode: number | null;
    try {
      const result = await resolveSchemeCode(asset, schemeList);
      schemeCode = result.schemeCode;
      if (schemeCode === null) {
        if (result.needsReview) {
          needsReview += 1;
          logger.warn({ job: "backfill_mutual_fund_nav_history", symbol: asset.symbol }, "no exact scheme-name match — needs manual review");
        } else {
          unmatched += 1;
        }
        continue;
      }
    } catch (e) {
      logger.warn({ job: "backfill_mutual_fund_nav_history", symbol: asset.symbol, err: e }, "scheme resolution failed");
      unmatched += 1;
      continue;
    }

    try {
      const history = await getSchemeHistory(schemeCode);
      const rows: PriceHistoryRow[] = history.map((p) => ({
        id: uuidv5(`${asset.symbol}-${p.date.toISOString().slice(0, 10)}`, UUID_NAMESPACE_DNS),
        assetId: asset.id,
        symbol: asset.symbol,
        price: p.nav,
        volume: null,
        timestamp: p.date,
      }));
      await bulkInsertPriceHistory(rows);
      resolved += 1;
      totalRows += rows.length;
      logger.info({ job: "backfill_mutual_fund_nav_history", symbol: asset.symbol, rows: rows.length }, "history backfilled");
    } catch (e) {
      logger.warn({ job: "backfill_mutual_fund_nav_history", symbol: asset.symbol, err: e }, "history fetch failed");
      unmatched += 1;
    }
  }

  logger.info(
    { job: "backfill_mutual_fund_nav_history", resolved, needsReview, unmatched, totalRows, total: assets.length },
    "completed",
  );

  // 0 resolved is a structural coverage gap (held MF symbols are AMFI
  // scheme-code slugs with truncated names, so neither ISIN nor exact-name
  // resolution can land), not a provider failure — succeed with a warning
  // rather than a red FAILED row. needsReview > 0 means the matcher found
  // candidates it couldn't confirm (worth a human look); a genuine history
  // fetch/write error is still counted per-asset and logged as it was.
  const warning =
    resolved === 0
      ? `0 of ${assets.length} held mutual fund assets resolved to an mfapi.in scheme (${needsReview} need manual review, ${unmatched} unmatched)`
      : undefined;

  return { resolved, needsReview, unmatched, totalRows, warning };
}

/** Manual/one-time-backfill entrypoint, same shape as seedPriceHistoryTask —
 * no BullMQ repeatable schedule is registered for this job. */
export async function backfillMutualFundNavHistoryTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("backfill_mutual_fund_nav_history", logId)) return;
  await wrapJobExecution("backfill_mutual_fund_nav_history", logId, backfillMutualFundNavHistory);
}

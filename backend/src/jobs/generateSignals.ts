import { prisma } from "../prisma";
import { NotFoundError } from "../lib/errors";
import { getTechnicalIndicators, type TechnicalIndicators } from "../lib/marketProviders/yahoo";
import { cacheAssetSignals } from "../lib/evaluation/cache";
import { generateScores } from "./generateScores";

/** Port of generate_signals. Reuses the indicators processAssetSnapshot
 * already fetched for this symbol moments earlier, when chained from it,
 * instead of making a second live getTechnicalIndicators call. Standalone
 * callers (admin reprocess/backfill/repair) pass none, so it fetches here
 * as Python does. */
export async function generateSignals(assetId: string, indicators?: Partial<TechnicalIndicators>): Promise<void> {
  const quote = await prisma.latestQuote.findFirst({ where: { assetId } });
  if (!quote) throw new NotFoundError(`LatestQuote not found for asset: ${assetId}`);
  const symbol = quote.symbol;

  const signalsDict: Record<string, unknown> = indicators == null ? await getTechnicalIndicators(symbol) : { ...indicators };

  signalsDict.asset_id = assetId;
  signalsDict.symbol = symbol;
  signalsDict.updated_at = new Date().toISOString();
  await cacheAssetSignals(assetId, signalsDict);

  await generateScores(assetId);
}

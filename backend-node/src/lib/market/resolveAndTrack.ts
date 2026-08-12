import { prisma } from "../../prisma";
import { looksLikeSymbol, resolveQuoteProvider } from "../marketProviders/routing";
import { ingestQuote } from "../../jobs/ingestQuote";

/** Partial port of app/workers/ingestion/tasks.py resolve_and_track_symbol.
 * Dispatched fire-and-forget by searchMarket() when a search query has no DB
 * match and passes looksLikeSymbol's plausibility gate — same as Python,
 * this must never block the search response the caller is already looking
 * at (a live provider call can take 0.3-8s).
 *
 * Ports the "does this resolve, and if so mark it tracked" core: ingestQuote
 * already creates/updates the Asset + LatestQuote row on a successful quote
 * (see ingestionRepo.ts's getOrCreateAsset, called from saveQuote), so this
 * only needs to flip is_tracked=true afterward.
 *
 * KNOWN GAP vs. Python: does not run IndexUniverseSeedService.backfill_history
 * (bulk historical-price backfill for the newly tracked symbol) — that
 * service lives in the AI/data-maintenance domain and isn't ported to Node
 * in this phase. The symbol still becomes searchable/trackable immediately
 * (Asset row + is_tracked=true + one live quote), it just won't have chart
 * history until the regular ingestion pipeline accumulates it day by day,
 * instead of being backfilled immediately. Flagged as a concern, not
 * silently dropped.
 */
export async function resolveAndTrackSymbol(query: string): Promise<void> {
  const symbol = query.toUpperCase().trim();
  if (!looksLikeSymbol(symbol)) return;

  const providerName = resolveQuoteProvider(symbol, null);

  try {
    await ingestQuote(providerName, symbol);
  } catch {
    // Matches Python: a failed lookup is never tracked (no-fake-data — "no
    // results" rather than a placeholder asset), so the error is swallowed.
    return;
  }

  const asset = await prisma.asset.findUnique({ where: { symbol } });
  if (!asset) return; // Matches Python's defensive "quoted OK but no Asset row found" guard.
  if (!asset.isTracked) {
    await prisma.asset.update({ where: { id: asset.id }, data: { isTracked: true } });
  }
}

import type { MfapiSchemeListEntry } from "../marketProviders/mfapi";

function normalize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Exact ISIN match against mfapi.in's isinGrowth/isinDivReinvestment
 * columns. No fuzzy fallback — an ISIN is either right or it isn't. */
export function matchIsinToSchemeCode(isin: string, schemeList: MfapiSchemeListEntry[]): number | null {
  const target = normalize(isin);
  for (const entry of schemeList) {
    if (entry.isinGrowth && normalize(entry.isinGrowth) === target) return entry.schemeCode;
    if (entry.isinDivReinvestment && normalize(entry.isinDivReinvestment) === target) return entry.schemeCode;
  }
  return null;
}

/** Auto-accept policy for name-based resolution: only a single exact match
 * (after normalizing both sides the same way mfSymbol() does) is trusted.
 * A wrong fuzzy match would silently attach one fund's price history to a
 * different fund, so anything short of exactly-one-exact-match returns
 * null — the caller logs that as "needs manual review," never auto-applies
 * it. */
export function matchNameToSchemeCode(
  displayName: string,
  searchResults: Array<{ schemeCode: number; schemeName: string }>,
): number | null {
  const target = normalize(displayName);
  const exact = searchResults.filter((r) => normalize(r.schemeName) === target);
  return exact.length === 1 ? exact[0].schemeCode : null;
}

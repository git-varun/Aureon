// Port of portfolio_importer.py's _clean_isin/_mf_symbol/_mf_symbol_for
// (CSV/transaction-import MF symbol builder) and the separate _slug-based
// fallback used inline by parse_cdsl_cas (CAS's MF symbol builder). These are
// two DISTINCT rules — do not unify them:
//   - mfSymbolFor: ISIN-based symbol only when the cleaned ISIN starts with
//     "INF"; otherwise an UPPERCASE name slug.
//   - casSymbolFor: ISIN-based symbol whenever any ISIN is present at all (no
//     INF-prefix check); otherwise a lowercase name slug.

export function cleanIsin(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function mfSymbol(name: string): string {
  const slug = name.toUpperCase().trim().replace(/[^A-Z0-9]+/g, "_");
  return slug.slice(0, 40).replace(/_+$/, "") + "_MF";
}

/** Port of _mf_symbol_for. */
export function mfSymbolFor(name: string, isin = ""): string {
  const clean = isin ? cleanIsin(isin) : "";
  if (clean.startsWith("INF")) return `${clean}_MF`;
  return mfSymbol(name);
}

/** Port of _slug. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Port of parse_cdsl_cas's inline `f"{isin}_MF" if isin else f"{_slug(scheme_name)}_MF"`.
 * `isin` here is the value already stored on the merged holding record, which
 * upstream code cleans via _clean_isin before storing — so this takes an
 * already-cleaned ISIN, not raw text (see casImport.ts's call site). */
export function casSymbolFor(schemeName: string, cleanedIsin = ""): string {
  if (cleanedIsin) return `${cleanedIsin}_MF`;
  return `${slug(schemeName)}_MF`;
}

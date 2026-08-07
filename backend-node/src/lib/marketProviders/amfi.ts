import { ProviderError } from "../errors";

const NAV_ALL_URL = "https://www.amfiindia.com/spages/NAVAll.txt";

/** Port of _parse_navall — parses AMFI's semicolon-delimited NAVAll.txt into
 * an ISIN -> NAV map. Fund-house/category header lines and blank separator
 * lines have no ';' and are skipped. Both ISIN columns (growth and
 * reinvestment plans) are indexed to the same NAV since CDSL CAS statements
 * aren't guaranteed to have parsed one specific variant. */
function parseNavAll(text: string): Map<string, number> {
  const isinToNav = new Map<string, number>();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || !line.includes(";")) continue;
    const parts = line.split(";");
    if (parts.length < 5) continue;
    const [schemeCode, isinGrowth, isinReinvestment, , navStr] = parts.map((p) => p.trim());
    if (schemeCode.toLowerCase() === "scheme code") continue;
    const nav = Number(navStr);
    if (Number.isNaN(nav)) continue;
    for (const isin of [isinGrowth, isinReinvestment]) {
      if (isin && isin !== "-") isinToNav.set(isin, nav);
    }
  }
  return isinToNav;
}

/** Port of AmfiAdapter.get_all_navs — AMFI's daily NAVAll.txt is a single
 * bulk file covering every scheme, not a per-symbol API. */
export async function getAllNavs(): Promise<Map<string, number>> {
  try {
    const res = await fetch(NAV_ALL_URL, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseNavAll(await res.text());
  } catch (e) {
    throw new ProviderError(`AMFI NAVAll.txt fetch failed: ${(e as Error).message}`);
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(NAV_ALL_URL, { signal: AbortSignal.timeout(10_000) });
    return res.status < 400;
  } catch {
    return false;
  }
}

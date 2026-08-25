import { ProviderError } from "../errors";

const MFAPI_BASE = "https://api.mfapi.in/mf";

export interface MfapiSchemeListEntry {
  schemeCode: number;
  schemeName: string;
  isinGrowth: string | null;
  isinDivReinvestment: string | null;
}

export interface MfapiHistoryPoint {
  date: Date;
  nav: number;
}

function parseDdMmYyyy(s: string): Date {
  const [dd, mm, yyyy] = s.split("-").map(Number);
  return new Date(Date.UTC(yyyy, mm - 1, dd));
}

/** Full scheme list (~5.7MB) from the community-run mfapi.in (sourced from
 * AMFI data) — used to match a held MF's ISIN to a scheme code. AMFI's own
 * per-scheme history page (DownloadNAVHistoryReport_Po.aspx) was live-checked
 * during design and returns an empty JS-driven frameset with no data, so
 * mfapi.in is used instead (the existing refreshMutualFundNavs job already
 * tags LatestQuote.provider as "mfapi", suggesting this was anticipated).
 * Fetched fresh per call — no persistent cache, since callers are
 * manually-triggered/infrequent jobs, not a hot path. */
export async function getSchemeList(): Promise<MfapiSchemeListEntry[]> {
  try {
    const res = await fetch(MFAPI_BASE, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = (await res.json()) as Array<{
      schemeCode: number;
      schemeName: string;
      isinGrowth: string | null;
      isinDivReinvestment: string | null;
    }>;
    return raw.map((r) => ({
      schemeCode: r.schemeCode,
      schemeName: r.schemeName,
      isinGrowth: r.isinGrowth,
      isinDivReinvestment: r.isinDivReinvestment,
    }));
  } catch (e) {
    throw new ProviderError(`mfapi.in scheme list fetch failed: ${(e as Error).message}`);
  }
}

/** Full daily NAV history for one scheme code, oldest-to-newest (mfapi.in
 * returns newest-first). */
export async function getSchemeHistory(schemeCode: number): Promise<MfapiHistoryPoint[]> {
  try {
    const res = await fetch(`${MFAPI_BASE}/${schemeCode}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { data: Array<{ date: string; nav: string }> };
    return body.data
      .map((d) => ({ date: parseDdMmYyyy(d.date), nav: Number(d.nav) }))
      .filter((p) => Number.isFinite(p.nav) && p.nav > 0 && !Number.isNaN(p.date.getTime()))
      .reverse();
  } catch (e) {
    throw new ProviderError(`mfapi.in history fetch failed for scheme ${schemeCode}: ${(e as Error).message}`);
  }
}

/** Server-side name search — used only to resolve slug-only (no-ISIN) held
 * MFs. Results are NOT auto-trusted; callers apply an exact-match policy
 * (see mfSchemeMatch.ts). */
export async function searchSchemesByName(name: string): Promise<Array<{ schemeCode: number; schemeName: string }>> {
  try {
    const res = await fetch(`${MFAPI_BASE}/search?q=${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Array<{ schemeCode: number; schemeName: string }>;
  } catch (e) {
    throw new ProviderError(`mfapi.in search failed for "${name}": ${(e as Error).message}`);
  }
}

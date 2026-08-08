import { openPdf, extractText, extractTables } from "./pdfTable";
import { cleanIsin, casSymbolFor } from "./mfSymbol";

// Port of portfolio_importer.py's parse_cdsl_cas and its table-parsing
// helpers (lines ~360-534, 556-643). CAS has zero Python test coverage
// (confirmed: no test_cas_import.py exists) and this Node port has never
// been run against a real CDSL CAS PDF (none exist anywhere in this repo) —
// verified only against hand-built synthetic PDFs reproducing the
// documented table-header shapes. Flag this explicitly wherever this
// module's output is reported.

export interface CasHolding {
  symbol: string;
  name: string;
  quantity: number;
  avg_buy_price: number;
  current_price: number | null;
  source: string;
  asset_type: "mutual_fund";
}

function num(val: string | undefined | null): number | null {
  if (val == null) return null;
  const s = String(val).replace(/,/g, "").trim();
  if (["--", "-", "", "N/A", "NA"].includes(s)) return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function norm(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cell(row: string[], idx: number | undefined): string {
  if (idx === undefined || idx >= row.length || row[idx] == null) return "";
  return String(row[idx]).replace(/\n/g, " ").trim();
}

function cleanSchemeName(raw: string): string {
  const s = raw.replace(/\n/g, " ").trim();
  if (s.includes("#")) {
    let after = s.split("#").slice(1).join("#").trim();
    after = after.replace(/^[A-Z0-9 ]+ MF-/i, "").trim();
    return after || s;
  }
  return s;
}

function isFolioHeader(row: string[]): boolean {
  const norms = new Set(row.filter((c) => c).map(norm));
  return (
    [...norms].some((n) => n.includes("isin")) &&
    [...norms].some((n) => n.includes("folio")) &&
    [...norms].some((n) => n.includes("scheme")) &&
    [...norms].some((n) => n.includes("nav"))
  );
}

function isHoldingHeader(row: string[]): boolean {
  const norms = new Set(row.filter((c) => c).map(norm));
  return (
    [...norms].some((n) => n.includes("isin")) &&
    [...norms].some((n) => n.includes("security")) &&
    [...norms].some((n) => n.includes("currentbal") || (n.startsWith("current") && n.includes("bal"))) &&
    [...norms].some((n) => n.includes("marketprice") || n.includes("faceval") || (n.includes("market") && n.includes("price")))
  );
}

function mapFolioCols(headerRow: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  headerRow.forEach((c, ci) => {
    const n = norm(c);
    const raw = String(c).toLowerCase();
    const set = (key: string) => {
      if (!(key in m)) m[key] = ci;
    };
    if (n.includes("scheme") && n.includes("name")) set("scheme");
    else if (n === "isin" || n === "isinisin") set("isin");
    else if (n.includes("folio")) set("folio");
    else if (n.includes("closing") || (n.includes("unit") && n.includes("closing"))) set("units");
    else if (n.includes("nav") && !n.includes("cumul") && !n.includes("unreali") && !n.includes("valuation")) set("nav");
    else if (n.includes("cumul") || n.includes("invest")) set("invested");
    else if (n.includes("valuation")) set("valuation");
    else if (n.includes("unreali") && !raw.includes("%")) set("pnl");
    else if (n.includes("unreali") && raw.includes("%")) set("pnl_pct");
  });
  return m;
}

function mapHoldingCols(headerRow: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  headerRow.forEach((c, ci) => {
    const n = norm(c);
    const set = (key: string) => {
      if (!(key in m)) m[key] = ci;
    };
    if (n === "isin" || n === "isinisin") set("isin");
    else if (n.includes("security")) set("security");
    else if (n.includes("currentbal") || (n.startsWith("current") && n.length < 20)) set("units");
    else if (n.includes("marketprice") || n.includes("faceval") || (n.includes("market") && n.includes("price"))) set("price");
    else if (n.includes("value") && !n.includes("pledge") && !n.includes("setup") && !n.includes("face")) set("value");
  });
  return m;
}

interface FolioRow {
  scheme_name: string;
  isin: string;
  folio_no: string;
  units: number;
  avg_nav: number;
  current_nav: number;
  valuation: number;
  source: "cas_folio";
}

function parseFolioTable(table: string[][]): FolioRow[] {
  let hdrRow: string[] | null = null;
  let dataStart = -1;
  for (let ri = 0; ri < Math.min(3, table.length); ri++) {
    if (isFolioHeader(table[ri])) {
      hdrRow = table[ri];
      dataStart = ri + 1;
      break;
    }
  }
  if (!hdrRow) return [];
  const col = mapFolioCols(hdrRow);
  const results: FolioRow[] = [];
  for (const row of table.slice(dataStart)) {
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;
    const scheme = cell(row, col.scheme ?? 0);
    if (!scheme || scheme.toLowerCase().includes("grand total") || scheme.toLowerCase().includes("load structure")) continue;
    const isin = cleanIsin(cell(row, col.isin ?? 1));
    const folio = cell(row, col.folio ?? 2);
    const units = num(cell(row, col.units ?? 3));
    const nav = num(cell(row, col.nav ?? 4));
    const invested = num(cell(row, col.invested ?? 5));
    const val = num(cell(row, col.valuation ?? 6));

    if (units === null || units <= 0) continue;

    const avgNav = units > 0 && invested && invested > 0 ? Math.round((invested / units) * 10000) / 10000 : 0.0;
    results.push({
      scheme_name: scheme,
      isin,
      folio_no: folio,
      units,
      avg_nav: avgNav,
      current_nav: nav || 0.0,
      valuation: val || 0.0,
      source: "cas_folio",
    });
  }
  return results;
}

interface HoldingRow {
  scheme_name: string;
  isin: string;
  folio_no: string;
  units: number;
  avg_nav: number;
  current_nav: number;
  valuation: number;
  source: "cas_demat";
  dp: string;
}

function parseHoldingTable(table: string[][], dpName: string): HoldingRow[] {
  let hdrRow: string[] | null = null;
  let dataStart = -1;
  for (let ri = 0; ri < Math.min(3, table.length); ri++) {
    if (isHoldingHeader(table[ri])) {
      hdrRow = table[ri];
      dataStart = ri + 1;
      break;
    }
  }
  if (!hdrRow) return [];
  const col = mapHoldingCols(hdrRow);
  const results: HoldingRow[] = [];
  for (const row of table.slice(dataStart)) {
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;
    const isin = cleanIsin(cell(row, col.isin ?? 0));
    if (!isin.startsWith("INF")) continue;
    const securityRaw = cell(row, col.security ?? 1);
    const units = num(cell(row, col.units ?? 2));
    const price = num(cell(row, col.price ?? 7));
    const value = num(cell(row, col.value ?? 8));

    if (units === null || units <= 0) continue;
    results.push({
      scheme_name: cleanSchemeName(securityRaw),
      isin,
      folio_no: "",
      units,
      avg_nav: 0.0,
      current_nav: price || 0.0,
      valuation: value || 0.0,
      source: "cas_demat",
      dp: dpName,
    });
  }
  return results;
}

const DP_PATTERN = /DP\s+Name\s*[:\-]\s*([A-Z][A-Z0-9 &()]+?)(?:\s{3,}|BO ID|$)/i;

export async function parseCdslCas(content: Buffer, password?: string): Promise<{ holdings: CasHolding[]; summary: Record<string, number> }> {
  const pdf = await openPdf(content, password);

  const mfFolios: FolioRow[] = [];
  const dematMf: HoldingRow[] = [];
  let currentDp = "";

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const text = await extractText(page);
    const tables = await extractTables(page, (row) => isFolioHeader(row) || isHoldingHeader(row));

    const dm = text.match(DP_PATTERN);
    if (dm) {
      const cand = dm[1].trim().split("\n")[0].trim();
      if (cand.length > 3) currentDp = cand;
    }

    for (const table of tables) {
      if (table.length === 0) continue;
      if (Array.from({ length: Math.min(3, table.length) }, (_, ri) => table[ri]).some(isFolioHeader)) {
        mfFolios.push(...parseFolioTable(table));
      } else if (Array.from({ length: Math.min(3, table.length) }, (_, ri) => table[ri]).some(isHoldingHeader)) {
        dematMf.push(...parseHoldingTable(table, currentDp));
      }
    }
  }

  // Deduplicate demat by (isin, dp).
  const seen = new Set<string>();
  const dedupedDemat: HoldingRow[] = [];
  for (const h of dematMf) {
    const key = `${h.isin}|${h.dp}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedupedDemat.push(h);
    }
  }

  // Merge by ISIN (folio takes precedence; demat adds new or sums units).
  interface Merged {
    isin: string;
    scheme_name: string;
    units: number;
    avg_nav: number;
    current_nav: number;
    source: string;
  }
  const merged = new Map<string, Merged>();
  for (const h of mfFolios) {
    const key = h.isin || h.folio_no;
    merged.set(key, {
      isin: h.isin,
      scheme_name: h.scheme_name,
      units: h.units,
      avg_nav: h.avg_nav,
      current_nav: h.current_nav,
      source: "CDSL CAS (Folio)",
    });
  }
  for (const h of dedupedDemat) {
    const key = h.isin;
    const existing = merged.get(key);
    if (existing) {
      existing.units += h.units;
    } else {
      merged.set(key, {
        isin: h.isin,
        scheme_name: h.scheme_name,
        units: h.units,
        avg_nav: 0.0,
        current_nav: h.current_nav,
        source: "CDSL CAS (Demat)",
      });
    }
  }

  const holdings: CasHolding[] = [];
  for (const m of merged.values()) {
    const symbol = casSymbolFor(m.scheme_name, m.isin);
    holdings.push({
      symbol,
      name: m.scheme_name,
      quantity: m.units,
      avg_buy_price: m.avg_nav,
      current_price: m.current_nav || null,
      source: m.source,
      asset_type: "mutual_fund",
    });
  }

  return {
    holdings,
    summary: { mf_folios_count: mfFolios.length, demat_mf_count: dedupedDemat.length, merged_count: holdings.length },
  };
}

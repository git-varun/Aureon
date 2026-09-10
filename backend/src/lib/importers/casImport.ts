import { openPdf, extractText, extractTables } from "./pdfTable";
import { cleanIsin, casSymbolFor } from "./mfSymbol";
import { ImportParseError } from "./errors";

// Port of portfolio_importer.py's parse_cdsl_cas and its table-parsing
// helpers (lines ~360-534, 556-643). CAS has zero Python test coverage
// (confirmed: no test_cas_import.py exists).
//
// The MF-folio table parser (parseFolioTable) was rewritten on 2026-09-10
// after its first run against a real CDSL CAS PDF: the statement's
// "MUTUAL FUND UNITS HELD" table has a bilingual (Hindi+English) multi-line
// header and data rows whose leading columns (scheme name / ISIN / folio)
// drift, wrap, or merge unpredictably, so the old header-index column map
// (mapFolioCols) silently mis-mapped ISIN, units and NAV. It now anchors on
// the row's trailing run of 6 numeric columns and resolves fund identity
// from the clean "MF Folios" key-value block (parseMfFolioBlock), joined on
// folio number, failing loudly rather than importing a mis-parsed row.
// The demat-holding parser (parseHoldingTable) has the same header-index
// fragility and has NOT yet been verified against a real PDF — flag its
// output as unverified.

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

export interface FolioMeta {
  isin: string;
  folio_no: string;
  scheme_name: string;
}

const ISIN_RE = /^INF[A-Z0-9]{9}$/;
// A CDSL MF folio number: a run of >=4 digits, a "/", then more digits (e.g.
// "35726665/58", "57735580124/0"). The lookbehind stops it latching onto the
// trailing digits of an adjacent ISIN token ("...01WA6 35726665/58").
const FOLIO_RE = /(?<![A-Za-z0-9])(\d{4,}\s*\/\s*\d+)/;

function normFolio(s: string): string {
  return s.replace(/\s+/g, "");
}

/** Parses the clean "MF Folios" key-value block from the CAS account-details
 * pages into a folio-number -> {isin, scheme_name} lookup. This block is
 * unambiguous (one `AMC Name :` / `Scheme Name :` / `Folio No :` / `ISIN :`
 * group per fund) and is the source of truth for fund identity, since the
 * folio *table* mangles those same columns. Runs per page and results are
 * merged (the block can span a page break). */
export function parseMfFolioBlock(pageText: string): Map<string, FolioMeta> {
  const out = new Map<string, FolioMeta>();
  // Each fund entry starts at "AMC Name :"; the trailing chunk after the last
  // one runs to end-of-text, which is fine (we only read the fields we need).
  const chunks = pageText.split(/AMC Name\s*:/i).slice(1);
  for (const chunk of chunks) {
    const isin = chunk.match(/ISIN\s*:\s*(INF[A-Z0-9]{9})/i)?.[1]?.toUpperCase();
    const folio = chunk.match(/Folio No\s*:\s*([\d/ ]+?)(?:\s{2,}|Mode of|Email|KYC|$)/i)?.[1]?.trim();
    const scheme = chunk.match(/Scheme Name\s*:\s*(.+?)(?:\s{2,}|\s*Scheme Code|\n|$)/i)?.[1]?.trim();
    if (!isin || !folio || !ISIN_RE.test(isin)) continue;
    out.set(normFolio(folio), { isin, folio_no: folio, scheme_name: scheme || "" });
  }
  return out;
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

export function parseFolioTable(table: string[][], folioMeta: Map<string, FolioMeta>): FolioRow[] {
  let dataStart = 0;
  for (let ri = 0; ri < Math.min(3, table.length); ri++) {
    if (isFolioHeader(table[ri])) {
      dataStart = ri + 1;
      break;
    }
  }
  const results: FolioRow[] = [];
  for (const row of table.slice(dataStart)) {
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;

    // Anchor on the row's trailing run of numeric columns. A real MF-folio
    // data row ends with exactly 6: Closing Units | NAV | Amount Invested |
    // Valuation | Unrealised P/L | Unrealised P/L %. Tokens containing "/"
    // (folio numbers like "35726665/58") or letters (ISIN, scheme text) end
    // the run, so it cannot drift into the identity columns the way the old
    // header-index map did.
    const tail: number[] = [];
    for (let i = row.length - 1; i >= 0; i--) {
      const raw = String(row[i] ?? "").trim();
      if (!raw) continue;
      if (raw.includes("/") || /[A-Za-z]/.test(raw)) break;
      const n = num(raw);
      if (n === null) break;
      tail.unshift(n);
    }
    if (tail.length < 6) continue; // header remnants, "Grand Total" (2 numeric cols), notes

    const [units, nav, invested, valuation] = tail.slice(-6);
    const preTail = row.slice(0, row.length - tail.length).join(" ");
    const folioTok = preTail.match(FOLIO_RE)?.[1]?.trim();
    const meta = folioTok ? folioMeta.get(normFolio(folioTok)) : undefined;

    if (!meta) {
      throw new ImportParseError(
        `CDSL CAS: could not identify the fund for an MF-folio holding (folio "${folioTok ?? "?"}" ` +
          `not present in the "MF Folios" section). Refusing to import a mis-parsed row.`,
      );
    }
    if (!ISIN_RE.test(meta.isin) || units <= 0 || nav <= 0 || valuation <= 0) {
      throw new ImportParseError(
        `CDSL CAS: implausible MF-folio holding for ${meta.isin} (units=${units}, nav=${nav}, valuation=${valuation}).`,
      );
    }
    // Internal consistency: units x NAV must reconcile to the stated
    // valuation. Catches a units<->NAV transposition that the checks above
    // (both positive) would otherwise wave through.
    if (Math.abs(units * nav - valuation) / valuation > 0.01) {
      throw new ImportParseError(
        `CDSL CAS: MF-folio holding for ${meta.isin} fails the units x NAV = valuation check ` +
          `(${units} x ${nav} = ${(units * nav).toFixed(2)}, statement says ${valuation}).`,
      );
    }

    const avgNav = invested > 0 ? Math.round((invested / units) * 10000) / 10000 : 0.0;
    results.push({
      scheme_name: meta.scheme_name,
      isin: meta.isin,
      folio_no: meta.folio_no,
      units,
      avg_nav: avgNav,
      current_nav: nav,
      valuation,
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
  const folioMeta = new Map<string, FolioMeta>();
  let currentDp = "";

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const text = await extractText(page);
    const tables = await extractTables(page, (row) => isFolioHeader(row) || isHoldingHeader(row));

    // The "MF Folios" key-value block (Account Details section) precedes the
    // folio table and can straddle a page break — accumulate it as we go.
    for (const [k, v] of parseMfFolioBlock(text)) folioMeta.set(k, v);

    const dm = text.match(DP_PATTERN);
    if (dm) {
      const cand = dm[1].trim().split("\n")[0].trim();
      if (cand.length > 3) currentDp = cand;
    }

    for (const table of tables) {
      if (table.length === 0) continue;
      if (Array.from({ length: Math.min(3, table.length) }, (_, ri) => table[ri]).some(isFolioHeader)) {
        mfFolios.push(...parseFolioTable(table, folioMeta));
      } else if (Array.from({ length: Math.min(3, table.length) }, (_, ri) => table[ri]).some(isHoldingHeader)) {
        dematMf.push(...parseHoldingTable(table, currentDp));
      }
    }
  }

  // Completeness guard: every fund named in the "MF Folios" section must have
  // produced a parsed folio holding. A shortfall means a data row was
  // silently dropped (unrecognised shape) — fail rather than under-import.
  if (folioMeta.size > 0 && mfFolios.length < folioMeta.size) {
    throw new ImportParseError(
      `CDSL CAS: the "MF Folios" section lists ${folioMeta.size} funds but only ${mfFolios.length} folio ` +
        `holdings parsed cleanly. Refusing a partial import.`,
    );
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

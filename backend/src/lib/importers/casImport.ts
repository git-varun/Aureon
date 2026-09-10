import { openPdf, extractText, extractTables } from "./pdfTable";
import { casSymbolFor } from "./mfSymbol";
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
//
// The demat-holding parser (parseHoldingTable / isHoldingHeader) was
// rewritten the same way on 2026-09-11 — its header fingerprint never
// matched the real bilingual multi-line header, so the demat MF table was
// silently skipped entirely (0 of 6 demat-held MF/ETF ISINs imported). It
// now detects the header by ISIN+Security+(Free Bal|Value), anchors values
// on the trailing numeric run, and derives the held quantity (Current Bal,
// not Free Bal) by which leading column reconciles units x price = value.
// Demat holdings import at wallet "demat", separate from folio holdings of
// the same fund (see CasHolding.wallet).

export interface CasHolding {
  symbol: string;
  name: string;
  quantity: number;
  avg_buy_price: number;
  current_price: number | null;
  source: string;
  asset_type: "mutual_fund";
  // Position wallet. Folio holdings and demat-held units of the *same* fund
  // (same ISIN, so same symbol) are genuinely distinct holdings in different
  // custody — kept as separate Position rows via (portfolio, symbol, wallet).
  wallet: "spot" | "demat";
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

// The CDSL demat "HOLDING STATEMENT" header is bilingual and split across ~3
// physical lines ("Current" / "Bal" land on different clustered rows), so the
// old "current"+"bal"+"market price" fingerprint never matched a single row
// and the table was silently never parsed. Anchor instead on the one row that
// carries ISIN + Security + (Free Bal | Value), and exclude the near-identical
// "(Other Details)" lock-in sub-table header (has "Lockin" / "Balance
// Description", lacks "Free Bal" and "Value").
export function isHoldingHeader(row: string[]): boolean {
  const norms = [...new Set(row.filter((c) => c).map(norm))];
  const has = (s: string) => norms.some((n) => n.includes(s));
  return (
    has("isin") &&
    has("security") &&
    (has("freebal") || has("value")) &&
    !has("lockin") &&
    !has("balancedescription")
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

const HOLDING_ISIN_RE = /\b(IN[EF][A-Z0-9]{9})\b/;

export function parseHoldingTable(table: string[][], dpName: string): HoldingRow[] {
  let dataStart = 0;
  for (let ri = 0; ri < Math.min(3, table.length); ri++) {
    if (isHoldingHeader(table[ri])) {
      dataStart = ri + 1;
      break;
    }
  }
  const results: HoldingRow[] = [];
  // The security description wraps across several rows; the "<AMC> LTD#<AMC>
  // MF-<scheme>" fragment lands on the row(s) above the ISIN row. Collect
  // those so the holding gets a usable name — cleanSchemeName keeps only the
  // text after the last "#", so leading fragments of the *next* fund that
  // bleed in are harmless. (Continuation lines *below* the ISIN row aren't
  // captured, so names can be partial — identity is the ISIN, not the name.)
  let pendingName: string[] = [];
  for (const row of table.slice(dataStart)) {
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;

    const joined = row.join(" ");
    // The "(Other Details)" lock-in sub-table gets appended to this table
    // (its header matches no fingerprint, so extractTables never splits it
    // off). Its rows carry the same ISINs with 0.000 values — stop here.
    if (/other details|\blockin\b|\bbalance description\b/i.test(joined)) break;

    const isinMatch = joined.match(HOLDING_ISIN_RE);
    if (!isinMatch) {
      if (/[A-Za-z]/.test(joined) && !/^\s*(page \d|portfolio value)/i.test(joined)) pendingName.push(joined.trim());
      continue; // scheme-name fragment / footer row
    }
    const isin = isinMatch[1].toUpperCase();
    if (!isin.startsWith("INF")) continue; // listed equities (INE...) — CAS demat import is MF-only

    // Trailing run of numeric columns: ...| Free Bal | Market Price | Value.
    // "--" (frozen/pledge placeholders) and text tokens end the run.
    const tail: number[] = [];
    for (let i = row.length - 1; i >= 0; i--) {
      const raw = String(row[i] ?? "").trim();
      if (!raw) continue;
      if (raw.includes("/") || /[A-Za-z]/.test(raw)) break;
      const n = num(raw);
      if (n === null) break;
      tail.unshift(n);
    }
    if (tail.length < 2) continue; // "Portfolio Value ` ... as on ..." footer
    const value = tail[tail.length - 1];
    const price = tail[tail.length - 2];
    if (!(price > 0) || !(value > 0)) continue;

    // Quantity is Current Bal, NOT Free Bal. Both live in the row's leading
    // section (Free Bal is also the first cell of the trailing run). Pick the
    // first leading numeric that reconciles units x price = value: in column
    // order that is Current Bal; Free Bal (e.g. Mirae 0.471 free vs 764.107
    // held, the rest ELSS-locked) does not reconcile. When Current Bal ==
    // Free Bal (unlocked holdings) both reconcile and first-in-order still
    // returns Current Bal.
    const lead = row.slice(0, row.length - tail.length);
    let units: number | null = null;
    for (const c of lead) {
      const n = num(String(c ?? ""));
      if (n !== null && n > 0 && Math.abs(n * price - value) / value <= 0.01) {
        units = n;
        break;
      }
    }
    if (units === null) {
      throw new ImportParseError(
        `CDSL CAS: demat MF holding ${isin} — no quantity column reconciles to units x price = value ` +
          `(price=${price}, value=${value}). Refusing to import a mis-parsed row.`,
      );
    }

    const inRowName = lead.filter(
      (c) => /[A-Za-z]/.test(String(c)) && !HOLDING_ISIN_RE.test(String(c).trim()),
    );
    const rawName = [...pendingName, ...inRowName].join(" ").trim();
    pendingName = [];
    results.push({
      scheme_name: cleanSchemeName(rawName) || isin,
      isin,
      folio_no: "",
      units,
      avg_nav: 0.0,
      current_nav: price,
      valuation: value,
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

  // Fold demat holdings by ISIN. Duplicate (isin, dp) rows (same fund listed
  // twice on one DP's statement) are deduplicated; the same fund held at two
  // DPs sums into one demat-wallet position — one wallet, one value, matching
  // how the holdings view already weighted-averages a symbol across wallets.
  const dematByIsin = new Map<string, { isin: string; scheme_name: string; units: number; current_nav: number }>();
  const seenDematRow = new Set<string>();
  for (const h of dematMf) {
    const rowKey = `${h.isin}|${h.dp}`;
    if (seenDematRow.has(rowKey)) continue;
    seenDematRow.add(rowKey);
    const agg = dematByIsin.get(h.isin);
    if (agg) agg.units += h.units;
    else dematByIsin.set(h.isin, { isin: h.isin, scheme_name: h.scheme_name, units: h.units, current_nav: h.current_nav });
  }

  // Folio holdings (wallet "spot") and demat holdings (wallet "demat") stay
  // separate even when they share an ISIN — they are distinct holdings of the
  // same fund in different custody (see CasHolding.wallet).
  const holdings: CasHolding[] = [];
  for (const h of mfFolios) {
    holdings.push({
      symbol: casSymbolFor(h.scheme_name, h.isin),
      name: h.scheme_name,
      quantity: h.units,
      avg_buy_price: h.avg_nav,
      current_price: h.current_nav || null,
      source: "CDSL CAS (Folio)",
      asset_type: "mutual_fund",
      wallet: "spot",
    });
  }
  for (const m of dematByIsin.values()) {
    holdings.push({
      symbol: casSymbolFor(m.scheme_name, m.isin),
      name: m.scheme_name,
      quantity: m.units,
      // The demat HOLDING STATEMENT carries no cost basis. Seed avg_buy_price
      // with the statement's market price (as parse_nps_statement /
      // parse_epf_statement do for their cost-less holdings) so the position
      // reads "at cost" / ~0% P&L until a real cost is entered — never 0,
      // which a live NAV would turn into a fabricated ~100% gain.
      avg_buy_price: m.current_nav,
      current_price: m.current_nav || null,
      source: "CDSL CAS (Demat)",
      asset_type: "mutual_fund",
      wallet: "demat",
    });
  }

  return {
    holdings,
    summary: {
      mf_folios_count: mfFolios.length,
      demat_mf_count: dematByIsin.size,
      merged_count: holdings.length,
    },
  };
}

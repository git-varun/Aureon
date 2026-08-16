import ExcelJS from "exceljs";
import { cleanIsin, mfSymbol, slug } from "./mfSymbol";
import { ImportParseError } from "./errors";

export interface GrowwHoldingPayload {
  symbol: string;
  name: string;
  quantity: number;
  avg_buy_price: number;
  current_price: number | null;
  asset_type: string;
}

function norm(s: unknown): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function num(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const s = String(val).replace(/,/g, "").trim();
  if (["--", "-", "", "N/A", "NA"].includes(s)) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

function cell(row: string[], idx: number): string {
  if (idx < 0 || idx >= row.length || row[idx] === undefined) return "";
  return row[idx].replace(/\n/g, " ").trim();
}

async function loadRawRows(content: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(content as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  const rowsRaw: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const values = (row.values as unknown[]).slice(1); // exceljs 1-indexes row.values
    rowsRaw.push(values.map((v) => (v == null ? "" : String((v as { text?: string }).text ?? v))));
  });
  return rowsRaw;
}

function findHeaderRow(rowsRaw: string[][], requiredNorms: string[]): number | null {
  for (let i = 0; i < rowsRaw.length; i++) {
    const norms = new Set(rowsRaw[i].filter((c) => c !== "").map((c) => norm(c)));
    if (requiredNorms.every((req) => norms.has(req))) return i;
  }
  return null;
}

/** Port of parse_groww_stocks_holdings. See the Python docstring
 * (portfolio_importer.py:662-676) for why the symbol is ISIN/name-slug
 * synthesised rather than a real NSE/BSE ticker — no ISIN->ticker resolution
 * exists anywhere in this codebase. */
export async function parseGrowwStocksHoldings(content: Buffer): Promise<{ payloads: GrowwHoldingPayload[]; summary: { rows_found: number } }> {
  const rowsRaw = await loadRawRows(content);
  const headerIdx = findHeaderRow(rowsRaw, ["stockname", "isin", "quantity"]);
  if (headerIdx === null) {
    throw new ImportParseError(
      "Could not find the holdings table (expected Stock Name/ISIN/Quantity columns) in this file — is this a Groww Stocks Holdings Statement export?",
    );
  }

  const header = rowsRaw[headerIdx];
  const col: Record<string, number> = {};
  header.forEach((c, ci) => {
    const n = norm(c);
    if (n === "stockname" && col.name === undefined) col.name = ci;
    else if (n === "isin" && col.isin === undefined) col.isin = ci;
    else if (n === "quantity" && col.quantity === undefined) col.quantity = ci;
    else if (n === "averagebuyprice" && col.avg_price === undefined) col.avg_price = ci;
    else if (n === "closingprice" && col.current_price === undefined) col.current_price = ci;
  });

  const payloads: GrowwHoldingPayload[] = [];
  for (const row of rowsRaw.slice(headerIdx + 1)) {
    if (row.every((c) => c === undefined || c.trim() === "")) continue;
    const name = cell(row, col.name ?? 0);
    if (!name) continue;
    const isin = cleanIsin(cell(row, col.isin ?? 1));
    const qty = num(cell(row, col.quantity ?? 2));
    const avgPrice = num(cell(row, col.avg_price ?? 3));
    const currentPrice = col.current_price !== undefined ? num(cell(row, col.current_price)) : null;

    if (qty === null || qty <= 0) continue;

    const symbol = isin ? `${isin}_HOLDING` : `${slug(name).toUpperCase()}_HOLDING`;
    payloads.push({ symbol, name, quantity: qty, avg_buy_price: avgPrice ?? 0.0, current_price: currentPrice, asset_type: "equity" });
  }

  return { payloads, summary: { rows_found: payloads.length } };
}

/** Port of parse_groww_mf_holdings. See the Python docstring
 * (portfolio_importer.py:736-746) — no per-unit NAV column, so avg/current
 * NAV are derived from Invested/Current Value ÷ Units; no ISIN column, so
 * symbol reuses _mf_symbol()'s plain name-slug convention. */
export async function parseGrowwMfHoldings(content: Buffer): Promise<{ payloads: GrowwHoldingPayload[]; summary: { rows_found: number } }> {
  const rowsRaw = await loadRawRows(content);
  const headerIdx = findHeaderRow(rowsRaw, ["schemename", "units", "foliono"]);
  if (headerIdx === null) {
    throw new ImportParseError(
      "Could not find the MF holdings table (expected Scheme Name/Units/Folio No. columns) in this file — is this a Groww Mutual Funds holdings summary export?",
    );
  }

  const header = rowsRaw[headerIdx];
  const col: Record<string, number> = {};
  header.forEach((c, ci) => {
    const n = norm(c);
    if (n === "schemename" && col.name === undefined) col.name = ci;
    else if (n === "foliono" && col.folio === undefined) col.folio = ci;
    else if (n === "units" && col.units === undefined) col.units = ci;
    else if (n === "investedvalue" && col.invested === undefined) col.invested = ci;
    else if (n === "currentvalue" && col.current === undefined) col.current = ci;
  });

  const payloads: GrowwHoldingPayload[] = [];
  for (const row of rowsRaw.slice(headerIdx + 1)) {
    if (row.every((c) => c === undefined || c.trim() === "")) continue;
    const name = cell(row, col.name ?? 0);
    if (!name) continue;
    const units = num(cell(row, col.units ?? 6));
    const invested = num(cell(row, col.invested ?? 7));
    const current = num(cell(row, col.current ?? 8));

    if (units === null || units <= 0) continue;

    const avgNav = invested && units > 0 ? Math.round((invested / units) * 10000) / 10000 : 0.0;
    const currentNav = current && units > 0 ? Math.round((current / units) * 10000) / 10000 : null;

    payloads.push({ symbol: mfSymbol(name), name, quantity: units, avg_buy_price: avgNav, current_price: currentNav, asset_type: "mutual_fund" });
  }

  return { payloads, summary: { rows_found: payloads.length } };
}

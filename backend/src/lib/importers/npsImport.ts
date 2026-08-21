import { parse as parseCsvSync } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { ImportParseError } from "./errors";
import { openPdf, extractText } from "./pdfTable";
import { parseDate } from "./csvImport";
import { logger } from "../logger";

// Port of portfolio_importer.py's parse_nps_statement and its helpers
// (lines ~813-1024). Statements are CSV/XLSX/PDF renditions of the same
// comma-structured row grid — every format is normalised to string[][]
// before the shared section-parsing logic runs.

export interface NpsHolding {
  symbol: string;
  name: string;
  tier: number;
  quantity: number;
  current_nav: number;
  as_of_date: Date | null;
}

export interface NpsTxn {
  symbol: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  amount: number | null;
  date: Date;
  description: string;
  broker_reference: string;
}

function numParen(val: string | undefined | null): number | null {
  if (val == null) return null;
  let s = val.replace(/,/g, "").trim();
  if (["--", "-", "", "N/A", "NA"].includes(s)) return null;
  const neg = s.startsWith("(") && s.endsWith(")");
  if (neg) s = s.slice(1, -1).trim();
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return neg ? -n : n;
}

function isBlankRow(row: string[]): boolean {
  return !row || row.every((c) => !String(c ?? "").trim());
}

function detectNpsTier(firstLine: string): number | null {
  const m = firstLine.match(/Tier\s+(I|II)\s+Account/i);
  if (!m) return null;
  return m[1].toUpperCase() === "II" ? 2 : 1;
}

function npsSchemeLetter(schemeName: string): string | null {
  const m = schemeName.match(/SCHEME\s+([A-Z])\s*-\s*TIER/i);
  return m ? m[1].toUpperCase() : null;
}

const NPS_BUY_DESCRIPTIONS = new Set(["by voluntary contributions", "tier-2 contribution"]);
const NPS_SKIP_DESCRIPTIONS = new Set(["opening balance", "closing balance"]);

function rowsFromText(text: string): string[][] {
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return parseCsvSync(normalised, { relax_column_count: true, skip_empty_lines: false }) as string[][];
}

async function rowsFromXlsx(content: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(content as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const values = (row.values as unknown[]).slice(1);
    rows.push(values.map((v) => (v == null ? "" : String((v as { text?: string }).text ?? v))));
  });
  return rows;
}

async function rowsFromPdf(content: Buffer): Promise<string[][]> {
  const pdf = await openPdf(content);
  const pageTexts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    pageTexts.push(await extractText(await pdf.getPage(p)));
  }
  return rowsFromText(pageTexts.join("\n"));
}

export async function parseNpsStatement(
  content: Buffer,
  ext: "csv" | "xlsx" | "xls" | "pdf" = "csv",
): Promise<{ holdings: NpsHolding[]; transactions: NpsTxn[]; summary: { tier: number; pran: string; schemes_count: number; transactions_parsed: number } }> {
  let rows: string[][];
  if (ext === "xlsx" || ext === "xls") {
    rows = await rowsFromXlsx(content);
  } else if (ext === "pdf") {
    rows = await rowsFromPdf(content);
  } else {
    rows = rowsFromText(content.toString("utf-8").replace(/^﻿/, ""));
  }

  if (rows.length === 0) throw new ImportParseError("Empty NPS statement file");

  let tier: number | null = null;
  for (const row of rows.slice(0, 20)) {
    if (row && row.length > 0) {
      tier = detectNpsTier(row[0] ?? "");
      if (tier) break;
    }
  }
  if (tier === null) throw new ImportParseError("Could not detect Tier I/II from statement header");

  let pran: string | null = null;
  for (const row of rows) {
    if (row && (row[0] ?? "").trim().toLowerCase() === "pran" && row.length > 1) {
      pran = row[1].trim().replace(/^'+/, "").trim();
      break;
    }
  }
  if (!pran) throw new ImportParseError("Could not find PRAN in statement");

  // ── Investment Details - Scheme Wise Summary ──
  const holdings: NpsHolding[] = [];
  const summaryIdx = rows.findIndex((r) => r && (r[0] ?? "").trim().toLowerCase() === "investment details - scheme wise summary");
  if (summaryIdx !== -1) {
    const headerRow = rows[summaryIdx + 1] ?? [];
    let asOfDate: Date | null = null;
    for (const cell of headerRow) {
      const dm = String(cell ?? "").match(/(\d{1,2}-[A-Za-z]{3}-\d{4})/);
      if (dm) {
        asOfDate = parseDate(dm[1]);
        break;
      }
    }

    let i = summaryIdx + 2;
    while (i < rows.length && !isBlankRow(rows[i])) {
      const row = rows[i];
      const schemeName = (row[0] ?? "").trim();
      const units = row.length > 2 ? numParen(row[2]) : null;
      const nav = row.length > 3 ? numParen(row[3]) : null;
      const letter = npsSchemeLetter(schemeName);
      if (letter && units !== null) {
        const symbol = `NPS-${pran}-${letter}-T${tier}`;
        holdings.push({ symbol, name: schemeName, tier, quantity: units, current_nav: nav ?? 0.0, as_of_date: asOfDate });
      }
      i += 1;
    }
  }

  // ── Transaction Details (per-scheme sections) ──
  const transactions: NpsTxn[] = [];
  const txnIdx = rows.findIndex((r) => r && (r[0] ?? "").trim().toLowerCase() === "transaction details");
  if (txnIdx !== -1) {
    let i = txnIdx + 1;
    let currentScheme: string | null = null;
    while (i < rows.length) {
      const row = rows[i];
      if (isBlankRow(row)) {
        currentScheme = null;
        i += 1;
        continue;
      }
      if (currentScheme === null) {
        currentScheme = (row[0] ?? "").trim();
        i += 1;
        continue;
      }
      if ((row[0] ?? "").trim().toLowerCase() === "date") {
        i += 1;
        continue;
      }

      const dateStr = row.length > 0 ? (row[0] ?? "").trim() : "";
      const desc = row.length > 1 ? (row[1] ?? "").trim() : "";
      const amount = row.length > 2 ? numParen(row[2]) : null;
      const nav = row.length > 3 ? numParen(row[3]) : null;
      const units = row.length > 4 ? numParen(row[4]) : null;

      const descLower = desc.toLowerCase();
      if (NPS_SKIP_DESCRIPTIONS.has(descLower)) {
        i += 1;
        continue;
      }

      const date = parseDate(dateStr);
      const letter = npsSchemeLetter(currentScheme);
      if (!date || !letter || units === null) {
        i += 1;
        continue;
      }

      const symbol = `NPS-${pran}-${letter}-T${tier}`;

      let txnType: "BUY" | "SELL";
      let quantity: number;
      let txnAmount: number | null;
      if (NPS_BUY_DESCRIPTIONS.has(descLower)) {
        txnType = "BUY";
        quantity = units;
        txnAmount = amount;
      } else if (descLower.startsWith("billing for q")) {
        txnType = "SELL";
        quantity = Math.abs(units);
        txnAmount = amount !== null ? Math.abs(amount) : null;
      } else {
        txnType = units >= 0 ? "BUY" : "SELL";
        quantity = Math.abs(units);
        txnAmount = amount !== null ? Math.abs(amount) : null;
        logger.warn({ importer: "nps", description: desc, inferredType: txnType }, "unrecognised transaction description");
      }

      transactions.push({
        symbol,
        type: txnType,
        quantity,
        price: nav ?? 0.0,
        amount: txnAmount,
        date,
        description: desc,
        broker_reference: `${symbol}|${date.toISOString().slice(0, 10)}|${desc}`,
      });
      i += 1;
    }
  }

  return {
    holdings,
    transactions,
    summary: { tier, pran, schemes_count: holdings.length, transactions_parsed: transactions.length },
  };
}

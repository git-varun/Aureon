import { parse as parseCsvSync } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { mfSymbolFor } from "./mfSymbol";
import { extractTables, openPdf } from "./pdfTable";

// ── Port of portfolio_importer.py's transaction-file parser ────────────────
// (Zerodha/Groww/Binance CSV/XLSX/PDF tradebooks). Transcribed verbatim from
// backend/app/modules/portfolio/services/portfolio_importer.py lines 1-357.

export interface ParsedTxnRow {
  symbol: string;
  type: string;
  quantity: number;
  price: number;
  date: Date;
  broker: string;
  broker_reference: string | null;
  isin: string | null;
  exchange: string | null;
  name: string | null;
  asset_type: string | null;
}

// Accepted column names (case-insensitive) -> internal key.
const COL_MAP: Record<string, string> = {
  date: "date",
  "trade date": "date",
  trade_date: "date",
  "transaction date": "date",
  transaction_date: "date",
  symbol: "symbol",
  ticker: "symbol",
  scrip: "symbol",
  stock: "symbol",
  type: "type",
  "transaction type": "type",
  transaction_type: "type",
  "trade type": "type",
  trade_type: "type",
  action: "type",
  qty: "quantity",
  quantity: "quantity",
  shares: "quantity",
  units: "quantity",
  price: "price",
  rate: "price",
  "trade price": "price",
  "avg price": "price",
  instrument: "symbol",
  "avg. price": "price",
  "net price": "price",
  "buy/sell": "type",
  series: "_ignore",
  "trade id": "_order_id",
  "stock symbol": "symbol",
  "average traded price": "price",
  "stock/scrip name": "_name",
  "stock name": "_name",
  isin: "_isin",
  segment: "_segment",
  value: "_total",
  exchange: "_exchange",
  "exchange order id": "_order_id",
  "execution date and time": "date",
  "order status": "_status",
  "fund name": "_name",
  "scheme name": "_name",
  scheme: "_name",
  nav: "price",
  "nav (rs)": "price",
  "nav(rs.)": "price",
  "order date": "date",
  "allotment date": "date",
  "order type": "type",
  "units allotted": "quantity",
  "units purchased": "quantity",
  "units redeemed": "quantity",
  "amount (rs)": "_total",
  "amount(rs.)": "_total",
  amount: "_total",
  "folio no": "_folio",
  "folio no.": "_folio",
  "folio number": "_folio",
  "order id": "_order_id",
  "date(utc)": "date",
  pair: "symbol",
  side: "type",
  executed: "quantity",
  fee: "_fee",
  "average buy price": "_ignore",
  "buy value": "_ignore",
  "closing price": "_ignore",
  "closing value": "_ignore",
  "unrealised p&l": "_ignore",
  amc: "_ignore",
  category: "_ignore",
  "sub-category": "_ignore",
  source: "_ignore",
  "invested value": "_ignore",
  "current value": "_ignore",
  returns: "_ignore",
  xirr: "_ignore",
};

const UNSUPPORTED_GROWW_SHAPES: Record<string, string> = {
  groww_holdings_snapshot:
    "This looks like a Groww Stocks Holdings Statement — a point-in-time " +
    "holdings snapshot, not a transaction log, so it can't be imported " +
    "via this endpoint. Use POST /portfolios/{id}/import/groww/holdings " +
    "instead, or connect Groww's live sync under Settings if API " +
    "credentials are available.",
  groww_mf_holdings_snapshot:
    "This looks like a Groww Mutual Funds holdings summary — a " +
    "point-in-time snapshot, not a transaction log, so it can't be " +
    "imported via this endpoint. Use " +
    "POST /portfolios/{id}/import/groww/mf-holdings instead, or connect " +
    "Groww's live sync under Settings if API credentials are available.",
};

const VALID_TYPES = new Set(["buy", "sell", "dividend", "interest", "split", "bonus", "contribution", "withdrawal"]);

const TYPE_ALIAS: Record<string, string> = {
  b: "buy",
  purchase: "buy",
  bought: "buy",
  lumpsum: "buy",
  "additional purchase": "buy",
  sip: "buy",
  "switch in": "buy",
  "switch-in": "buy",
  s: "sell",
  sale: "sell",
  sold: "sell",
  redeem: "sell",
  redemption: "sell",
  "switch out": "sell",
  "switch-out": "sell",
  d: "dividend",
  div: "dividend",
};

function detectBroker(header: string[]): string | null {
  const lowers = new Set(header.map((c) => c.trim().toLowerCase()));
  if (lowers.has("pair") && (lowers.has("date(utc)") || lowers.has("side"))) return "binance";
  if (lowers.has("average buy price") && lowers.has("stock name")) return "groww_holdings_snapshot";
  if (lowers.has("amc") && lowers.has("xirr") && lowers.has("scheme name")) return "groww_mf_holdings_snapshot";
  if ((lowers.has("fund name") || lowers.has("scheme name")) && (lowers.has("nav") || lowers.has("nav (rs)") || lowers.has("nav(rs.)")))
    return "groww_mf";
  if (lowers.has("execution date and time")) return "groww";
  if (lowers.has("stock symbol") || lowers.has("average traded price")) return "groww";
  if ((lowers.has("instrument") || lowers.has("avg. price")) && lowers.has("series")) return "zerodha";
  if (
    lowers.has("trade type") &&
    lowers.has("segment") &&
    lowers.has("exchange") &&
    (lowers.has("trade id") || lowers.has("order id"))
  )
    return "zerodha";
  return null;
}

// Binance spot quote assets, in probe order (mirrors app/core/binance.py's
// SPOT_TRADE_QUOTES = STABLECOIN_ASSETS + CRYPTO_QUOTE_ASSETS). Not yet
// ported anywhere shared in backend-node, so scoped locally to this importer.
const SPOT_TRADE_QUOTES = ["USDT", "USDC", "BUSD", "FDUSD", "BTC", "ETH", "BNB"];

function normaliseBinanceSymbol(pair: string): string {
  for (const quote of SPOT_TRADE_QUOTES) {
    if (pair.length > quote.length && pair.endsWith(quote)) {
      return `${pair.slice(0, pair.length - quote.length)}-${quote}`;
    }
  }
  return pair;
}

function normaliseType(raw: string): string {
  const v = raw.trim().toLowerCase();
  return TYPE_ALIAS[v] ?? v;
}

// Port of _parse_date's ordered strptime format list. Each entry validates
// field ranges (Python's strptime rejects e.g. month=13 or Feb 30) via
// makeUtcDate's round-trip check, and the whole string must match (no
// trailing/leading slack), matching strptime's strict full-string semantics.
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
];

function makeUtcDate(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date | null {
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  if (dt.getUTCHours() !== h || dt.getUTCMinutes() !== mi || dt.getUTCSeconds() !== s) return null;
  return dt;
}

type DateFormat = (raw: string) => Date | null;

function monthIndex(name: string, list: string[]): number {
  const idx = list.findIndex((m) => m.toLowerCase() === name.toLowerCase());
  return idx === -1 ? -1 : idx + 1;
}

const DATE_FORMATS: DateFormat[] = [
  // %Y-%m-%d
  (raw) => {
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? makeUtcDate(+m[1], +m[2], +m[3]) : null;
  },
  // %d-%m-%Y
  (raw) => {
    const m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    return m ? makeUtcDate(+m[3], +m[2], +m[1]) : null;
  },
  // %d/%m/%Y
  (raw) => {
    const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? makeUtcDate(+m[3], +m[2], +m[1]) : null;
  },
  // %m/%d/%Y
  (raw) => {
    const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? makeUtcDate(+m[3], +m[1], +m[2]) : null;
  },
  // %d %b %Y  (e.g. "15 Jan 2024")
  (raw) => {
    const m = raw.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);
    if (!m) return null;
    const mo = monthIndex(m[2], MONTH_ABBR);
    return mo === -1 ? null : makeUtcDate(+m[3], mo, +m[1]);
  },
  // %Y/%m/%d
  (raw) => {
    const m = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    return m ? makeUtcDate(+m[1], +m[2], +m[3]) : null;
  },
  // %d-%b-%Y (e.g. "15-Jan-2024")
  (raw) => {
    const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (!m) return null;
    const mo = monthIndex(m[2], MONTH_ABBR);
    return mo === -1 ? null : makeUtcDate(+m[3], mo, +m[1]);
  },
  // %d %B %Y (e.g. "15 January 2024")
  (raw) => {
    const m = raw.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/);
    if (!m) return null;
    const mo = monthIndex(m[2], MONTH_FULL);
    return mo === -1 ? null : makeUtcDate(+m[3], mo, +m[1]);
  },
  // %d-%m-%Y %I:%M %p (12-hour clock, e.g. "15-01-2024 03:30 PM")
  (raw) => {
    const m = raw.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{1,2}):(\d{2}) (AM|PM|am|pm)$/);
    if (!m) return null;
    let hour = +m[4];
    const ampm = m[6].toUpperCase();
    if (hour < 1 || hour > 12) return null;
    if (ampm === "AM") hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
    return makeUtcDate(+m[3], +m[2], +m[1], hour, +m[5]);
  },
  // %d-%m-%Y %H:%M
  (raw) => {
    const m = raw.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/);
    return m ? makeUtcDate(+m[3], +m[2], +m[1], +m[4], +m[5]) : null;
  },
  // %Y-%m-%d %H:%M:%S
  (raw) => {
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    return m ? makeUtcDate(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]) : null;
  },
  // %Y-%m-%d %H:%M
  (raw) => {
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
    return m ? makeUtcDate(+m[1], +m[2], +m[3], +m[4], +m[5]) : null;
  },
];

export function parseDate(raw: string): Date | null {
  const trimmed = raw.trim();
  for (const fmt of DATE_FORMATS) {
    const d = fmt(trimmed);
    if (d) return d;
  }
  return null;
}

interface NormalisedRow {
  symbol?: string;
  type?: string;
  quantity?: string;
  price?: string;
  date?: Date | string | null;
  [key: string]: unknown;
}

function validateRow(row: NormalisedRow, idx: number): string[] {
  const errs: string[] = [];
  if (!row.symbol) errs.push(`row ${idx}: missing symbol`);
  if (!row.date) errs.push(`row ${idx}: missing or unparseable date`);
  const txnType = row.type ?? "";
  if (!VALID_TYPES.has(txnType)) {
    errs.push(`row ${idx}: invalid type '${txnType}' — expected one of ${[...VALID_TYPES].sort().join(", ")}`);
  }
  const qty = Number(row.quantity ?? 0);
  if (Number.isNaN(qty)) errs.push(`row ${idx}: quantity is not a number`);
  else if (qty <= 0) errs.push(`row ${idx}: quantity must be > 0`);
  const price = Number(row.price ?? 0);
  if (Number.isNaN(price)) errs.push(`row ${idx}: price is not a number`);
  else if (price < 0) errs.push(`row ${idx}: price must be ≥ 0`);
  return errs;
}

function rowsFromRecords(records: Array<Record<string, string>>, brokerIn?: string | null): { rows: ParsedTxnRow[]; errors: string[] } {
  const rows: ParsedTxnRow[] = [];
  const errors: string[] = [];

  let broker = brokerIn ?? null;
  if (!broker && records.length > 0) {
    broker = detectBroker(Object.keys(records[0]));
  }

  if (broker && broker in UNSUPPORTED_GROWW_SHAPES) {
    return { rows: [], errors: [UNSUPPORTED_GROWW_SHAPES[broker]] };
  }

  if (records.length > 0) {
    const foundCols = Object.keys(records[0]);
    const recognised = foundCols.filter((c) => COL_MAP[c.trim().toLowerCase()]);
    if (recognised.length === 0) {
      return { rows: [], errors: [`No recognised columns found. File headers: ${JSON.stringify(foundCols)}.`] };
    }
  }

  let i = 2;
  for (const rec of records) {
    const normalised: NormalisedRow = {};
    const extras: Record<string, string> = {};
    for (const [rawCol, val] of Object.entries(rec)) {
      const key = COL_MAP[(rawCol ?? "").trim().toLowerCase()];
      if (!key) continue;
      const strVal = val != null ? String(val).trim() : "";
      if (key.startsWith("_")) extras[key] = strVal;
      else (normalised as Record<string, string>)[key] = strVal;
    }

    if (Object.keys(normalised).length === 0) {
      i += 1;
      continue;
    }
    if (!Object.values(normalised).some((v) => typeof v === "string" && v.trim())) {
      i += 1;
      continue;
    }

    if (broker === "groww_mf") {
      const status = (extras._status ?? "").trim().toLowerCase();
      if (status && !["executed", "allotted", "redeemed", "completed", "successful", "success"].includes(status)) {
        i += 1;
        continue;
      }
      if (!normalised.symbol && extras._name) {
        normalised.symbol = mfSymbolFor(extras._name, extras._isin ?? "");
      }
    }

    if (broker === "groww" && (extras._status ?? "").trim().toLowerCase() !== "executed") {
      if (extras._status) {
        i += 1;
        continue;
      }
    }

    if (broker === "binance" && normalised.quantity !== undefined) {
      normalised.quantity = normalised.quantity.split(/\s+/)[0];
    }
    if (broker === "binance" && normalised.symbol !== undefined) {
      normalised.symbol = normaliseBinanceSymbol(normalised.symbol);
    }

    const isMfSegment = (extras._segment ?? "").trim().toUpperCase() === "MF";
    if (isMfSegment && normalised.symbol) {
      if (!extras._name) extras._name = normalised.symbol;
      normalised.symbol = mfSymbolFor(extras._name, extras._isin ?? "");
    }

    if (
      (broker === "zerodha" || broker === "groww") &&
      (extras._segment ?? "").trim().toUpperCase() !== "MF" &&
      normalised.symbol &&
      !normalised.symbol.toUpperCase().endsWith(".NS") &&
      !normalised.symbol.toUpperCase().endsWith(".BO")
    ) {
      normalised.symbol = `${normalised.symbol.toUpperCase()}.NS`;
    }

    if (normalised.price === undefined && extras._total !== undefined) {
      const total = parseFloat(extras._total.replace(/,/g, ""));
      const qty = parseFloat(normalised.quantity ?? "0");
      if (!Number.isNaN(total) && qty > 0) {
        normalised.price = String(Math.round((total / qty) * 10000) / 10000);
      }
    }

    if (normalised.date !== undefined) {
      normalised.date = parseDate(normalised.date as string);
    }
    if (normalised.type !== undefined) {
      normalised.type = normaliseType(normalised.type);
    }

    const errs = validateRow(normalised, i);
    errors.push(...errs);
    if (errs.length === 0) {
      rows.push({
        symbol: (normalised.symbol as string).toUpperCase(),
        type: (normalised.type as string).toUpperCase(),
        quantity: parseFloat(normalised.quantity as string),
        price: parseFloat(normalised.price as string),
        date: normalised.date as Date,
        broker: broker || "import",
        broker_reference: extras._order_id || null,
        isin: extras._isin || null,
        exchange: extras._exchange || null,
        name: extras._name || null,
        asset_type: broker === "groww_mf" || isMfSegment ? "mutual_fund" : null,
      });
    }
    i += 1;
  }

  return { rows, errors };
}

function parseCsvContent(content: Buffer, broker?: string | null): { rows: ParsedTxnRow[]; errors: string[] } {
  let text = content.toString("utf-8").replace(/^﻿/, "");
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const records = parseCsvSync(text, { columns: true, skip_empty_lines: true, relax_column_count: true }) as Array<
    Record<string, string>
  >;
  return rowsFromRecords(records, broker);
}

async function parseXlsxContent(content: Buffer, broker?: string | null): Promise<{ rows: ParsedTxnRow[]; errors: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(content as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  const rowsRaw: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const values = (row.values as unknown[]).slice(1); // exceljs 1-indexes row.values
    rowsRaw.push(values.map((v) => (v == null ? "" : String((v as { text?: string }).text ?? v))));
  });
  if (rowsRaw.length === 0) return { rows: [], errors: ["Empty spreadsheet"] };

  let headerIdx = 0;
  for (let i = 0; i < rowsRaw.length; i++) {
    const cols = rowsRaw[i].map((c) => c.trim().toLowerCase()).filter((c) => c);
    const matchCount = cols.filter((c) => COL_MAP[c]).length;
    if (matchCount >= 3) {
      headerIdx = i;
      break;
    }
  }
  const header = rowsRaw[headerIdx];
  const records: Array<Record<string, string>> = [];
  for (const row of rowsRaw.slice(headerIdx + 1)) {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => {
      if (i < row.length) rec[h] = row[i] ?? "";
    });
    records.push(rec);
  }
  return rowsFromRecords(records, broker);
}

async function parsePdfContent(content: Buffer, broker?: string | null): Promise<{ rows: ParsedTxnRow[]; errors: string[] }> {
  const pdf = await openPdf(content);
  const records: Array<Record<string, string>> = [];
  let header: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tables = await extractTables(page);
    for (const table of tables) {
      if (table.length === 0) continue;
      if (header.length === 0) header = table[0];
      for (const row of table.slice(1)) {
        const rec: Record<string, string> = {};
        header.forEach((h, i) => {
          if (i < row.length) rec[h] = row[i] ?? "";
        });
        records.push(rec);
      }
    }
  }
  if (records.length === 0) return { rows: [], errors: ["No tables found in PDF. Verify the file contains a transaction table."] };
  return rowsFromRecords(records, broker);
}

export async function parseTransactionFile(
  content: Buffer,
  ext: "csv" | "xlsx" | "xls" | "pdf",
  broker?: string | null,
): Promise<{ rows: ParsedTxnRow[]; errors: string[] }> {
  if (ext === "xlsx" || ext === "xls") return parseXlsxContent(content, broker);
  if (ext === "pdf") return parsePdfContent(content, broker);
  return parseCsvContent(content, broker);
}

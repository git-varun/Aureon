import { openPdf, extractText, extractTables } from "./pdfTable";
import { ImportParseError } from "./errors";
import { parseDate } from "./csvImport";

// Port of portfolio_importer.py's parse_epf_statement (lines ~1027-1264).
// Per the Python docstring: only the header + zero-transaction-year path has
// been validated against a real EPFO passbook export. The populated-
// transaction-row parsing follows the documented column layout (Wage Month,
// Date, Type, Particulars, EPF Wages, EPS Wages, Employee, Employer,
// Pension) but has never been exercised against a real file with actual
// contribution rows — carried forward here verbatim, in both Python and
// this Node port.

const EPF_ESTAB_RE = /Establishment\s+ID\/Name\s*[:|]\s*(\S+)\s*\/\s*(.+)/;
const EPF_MEMBER_RE = /Member\s+ID\/Name\s*[:|]\s*(\S+)\s*\/\s*(.+)/;
const EPF_UAN_RE = /\bUAN\s*[:|]?\s*(\d+)/;
const EPF_FY_RE = /Financial\s+Year\s*-\s*(\d{4}-\d{4})/;
const EPF_DATE_RE = /(\d{2}\/\d{2}\/\d{4})/;
const EPF_NEXT_LABEL_RE = /Member\s+ID\/Name|Date\s+of\s+Birth|UAN\s*[:|]|EPF\s+Passbook/;

interface EpfHeader {
  establishment_name: string | null;
  member_name: string | null;
  uan: string | null;
  financial_year: string | null;
}

function epfHeaderFields(text: string): EpfHeader {
  const estab = text.match(EPF_ESTAB_RE);
  const member = text.match(EPF_MEMBER_RE);
  const uan = text.match(EPF_UAN_RE);
  const fy = text.match(EPF_FY_RE);

  let establishmentName = estab ? estab[2].trim() : null;
  if (establishmentName) {
    const lines = text.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i++) {
      if (EPF_ESTAB_RE.test(lines[i])) {
        for (const cont of lines.slice(i + 1)) {
          if (!cont.trim() || EPF_NEXT_LABEL_RE.test(cont)) break;
          establishmentName = `${establishmentName} ${cont.trim()}`;
        }
        break;
      }
    }
  }

  return {
    establishment_name: establishmentName,
    member_name: member ? member[2].trim() : null,
    uan: uan ? uan[1].trim() : null,
    financial_year: fy ? fy[1].trim() : null,
  };
}

function epfRowDate(label: string): Date | null {
  const m = label.match(EPF_DATE_RE);
  return m ? parseDate(m[1].replace(/\//g, "-")) : null;
}

function num(val: string | undefined | null): number | null {
  if (val == null) return null;
  const s = String(val).replace(/,/g, "").trim();
  if (["--", "-", "", "N/A", "NA"].includes(s)) return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function cell(row: string[], idx: number): string {
  if (idx >= row.length || row[idx] == null) return "";
  return String(row[idx]).replace(/\n/g, " ").trim();
}

export interface EpfHolding {
  symbol: string;
  name: string;
  uan: string;
  member_name: string;
  establishment_name: string | null;
  quantity: 1.0;
  current_value: number;
  as_of_date: Date | null;
}

export interface EpfTxn {
  symbol: string;
  type: "BUY";
  amount: number;
  date: Date;
  description: string;
  broker_reference: string;
}

export interface EpfSummary {
  uan: string;
  member_name: string;
  establishment_name: string | null;
  financial_year: string | null;
  zero_transaction_year: boolean;
  transactions_parsed: number;
  closing_balance: number;
  page2_cross_check_ok: boolean;
}

interface BalanceRow {
  date: Date | null;
  employee: number;
  employer: number;
  pension: number;
}

export async function parseEpfStatement(
  content: Buffer,
  password?: string,
): Promise<{ holdings: EpfHolding[]; transactions: EpfTxn[]; summary: EpfSummary }> {
  const pdf = await openPdf(content, password);

  if (pdf.numPages === 0) throw new ImportParseError("Empty EPF passbook PDF");

  const page1 = await pdf.getPage(1);
  const page1Text = await extractText(page1);
  const header = epfHeaderFields(page1Text);
  if (!header.uan) throw new ImportParseError("Could not find UAN in EPF passbook");

  let opening: BalanceRow | null = null;
  let closing: BalanceRow | null = null;
  const txnRows: Array<{ wage_month: string; date: Date; employee: number; employer: number; pension: number; amount: number }> = [];
  let zeroTxnYear = false;

  const page1Tables = await extractTables(page1);
  for (const table of page1Tables) {
    for (const row of table) {
      if (!row || row.every((c) => c == null || !String(c).trim())) continue;
      const label = cell(row, 0);
      const labelLower = label.toLowerCase();

      if (labelLower.includes("no transactions available")) {
        zeroTxnYear = true;
        continue;
      }
      if (labelLower.startsWith("ob int")) {
        opening = {
          date: epfRowDate(label),
          employee: num(cell(row, 1)) ?? 0.0,
          employer: num(cell(row, 2)) ?? 0.0,
          pension: num(cell(row, 3)) ?? 0.0,
        };
        continue;
      }
      if (labelLower.startsWith("closing balance as on")) {
        closing = {
          date: epfRowDate(label),
          employee: num(cell(row, 1)) ?? 0.0,
          employer: num(cell(row, 2)) ?? 0.0,
          pension: num(cell(row, 3)) ?? 0.0,
        };
        continue;
      }
      if (
        labelLower.startsWith("total contributions") ||
        labelLower.startsWith("total transfer") ||
        labelLower.startsWith("total withdrawals") ||
        labelLower.startsWith("interest details")
      ) {
        continue;
      }
      if (labelLower === "wage month" || labelLower === "date" || labelLower === "") continue;

      // Candidate transaction row: Wage Month, Date, Type, Particulars,
      // EPF Wages, EPS Wages, Employee, Employer, Pension.
      const dateVal = epfRowDate(cell(row, 1));
      if (!dateVal) continue;
      const employeeAmt = num(cell(row, 6)) ?? 0.0;
      const employerAmt = num(cell(row, 7)) ?? 0.0;
      const pensionAmt = num(cell(row, 8)) ?? 0.0;
      const combined = employeeAmt + employerAmt + pensionAmt;
      if (combined <= 0) continue;
      txnRows.push({ wage_month: label, date: dateVal, employee: employeeAmt, employer: employerAmt, pension: pensionAmt, amount: combined });
    }
  }
  void opening; // parsed for parity with Python but unused downstream (Python also never reads `opening` after assignment).

  // Page 2 (Taxable Data): cross-check only — never imported as transactions.
  let page2TotalContribution = 0.0;
  if (pdf.numPages > 1) {
    const page2 = await pdf.getPage(2);
    const page2Tables = await extractTables(page2);
    for (const table of page2Tables) {
      for (const row of table) {
        if (!row) continue;
        const label = cell(row, 0).toLowerCase();
        if (!label || label === "cont. month" || label === "total") continue;
        const contrib = num(cell(row, 1));
        if (contrib) page2TotalContribution += contrib;
      }
    }
  }

  if (closing === null) throw new ImportParseError("Could not find Closing Balance in EPF passbook");

  const uan = header.uan;
  const symbol = `EPF-${uan}`;
  const memberName = header.member_name || uan;
  const totalBalance = closing.employee + closing.employer + closing.pension;

  const holdings: EpfHolding[] = [
    {
      symbol,
      name: `EPF - ${memberName}`,
      uan,
      member_name: memberName,
      establishment_name: header.establishment_name,
      quantity: 1.0,
      current_value: totalBalance,
      as_of_date: closing.date,
    },
  ];

  // Python's f"{value:,.0f}" always uses Western (3-digit) thousands
  // grouping, not Indian lakh/crore grouping, regardless of the user's
  // locale — match that exactly with "en-US", not "en-IN".
  const formatAmount = (n: number) => Math.round(n).toLocaleString("en-US");
  const transactions: EpfTxn[] = txnRows.map((row) => {
    let desc = `${row.wage_month}: Employee ₹${formatAmount(row.employee)} | Employer ₹${formatAmount(row.employer)}`;
    if (row.pension) desc += ` | Pension ₹${formatAmount(row.pension)}`;
    return {
      symbol,
      type: "BUY",
      amount: row.amount,
      date: row.date,
      description: desc,
      broker_reference: `${symbol}|${row.wage_month}|${row.date.toISOString().slice(0, 10)}`,
    };
  });

  const page1TotalContribution = txnRows.reduce((acc, r) => acc + r.employee + r.employer, 0);
  const crossCheckOk = zeroTxnYear || Math.abs(page1TotalContribution - page2TotalContribution) < 1.0;
  if (!crossCheckOk) {
    console.warn(
      `epf importer: page1/page2 contribution total mismatch for UAN=${uan} (page1=${page1TotalContribution}, page2=${page2TotalContribution})`,
    );
  }

  const summary: EpfSummary = {
    uan,
    member_name: memberName,
    establishment_name: header.establishment_name,
    financial_year: header.financial_year,
    zero_transaction_year: zeroTxnYear,
    transactions_parsed: transactions.length,
    closing_balance: totalBalance,
    page2_cross_check_ok: crossCheckOk,
  };

  return { holdings, transactions, summary };
}

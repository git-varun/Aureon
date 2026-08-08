import { describe, it, expect } from "vitest";
import PDFDocument from "pdfkit";
import { parseEpfStatement } from "./epfImport";

// Synthetic identifiers only — a fake UAN and fake name, never the real
// values that appear in the Python test suite's fixtures/inline mocks.
const FAKE_UAN = "000000000000";
const FAKE_MEMBER = "TEST USER";

function buildPage1TextLines(opts: { estabWrap?: boolean; memberIdLine?: string }): string[] {
  const lines = [
    "EPF Passbook",
    opts.estabWrap
      ? "Establishment ID/Name : ABC1234567 / Example Manufacturing"
      : "Establishment ID/Name : ABC1234567 / Example Manufacturing Co",
  ];
  if (opts.estabWrap) lines.push("Company Private Limited");
  lines.push(opts.memberIdLine ?? `Member ID/Name : MBR001 / ${FAKE_MEMBER}`);
  lines.push(`UAN : ${FAKE_UAN}`);
  lines.push("Financial Year - 2023-2024");
  return lines;
}

/** Builds a synthetic EPF passbook PDF: header text lines (one per row) plus
 * an optional table of positioned cells below them. Column spacing mirrors
 * casImport.test.ts's fix for pdfjs-dist's adjacent-text-run merging. */
function buildEpfPdf(opts: { headerLines: string[]; tableRows?: string[][] }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A3", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = 40;
    for (const line of opts.headerLines) {
      doc.text(line, 50, y, { lineBreak: false });
      y += 16;
    }
    y += 20;
    const colX = [50, 160, 260, 340, 420, 500, 580, 660, 760];
    for (const row of opts.tableRows ?? []) {
      row.forEach((cellText, ci) => {
        doc.text(cellText || "-", colX[ci] ?? 50 + ci * 90, y, { lineBreak: false });
      });
      y += 16;
    }
    doc.end();
  });
}

describe("parseEpfStatement", () => {
  it("extracts header fields including a wrapped (multi-line) establishment name", async () => {
    const bytes = await buildEpfPdf({
      headerLines: buildPage1TextLines({ estabWrap: true }),
      tableRows: [["Closing Balance as on 31/03/2024", "50000", "60000", "5000"]],
    });
    const { holdings } = await parseEpfStatement(bytes);
    expect(holdings[0].establishment_name).toBe("Example Manufacturing Company Private Limited");
    expect(holdings[0].uan).toBe(FAKE_UAN);
    expect(holdings[0].member_name).toBe(FAKE_MEMBER);
  });

  it("does not wrap the establishment name past a next-label line", async () => {
    const bytes = await buildEpfPdf({
      headerLines: buildPage1TextLines({ estabWrap: false }),
      tableRows: [["Closing Balance as on 31/03/2024", "50000", "60000", "5000"]],
    });
    const { holdings } = await parseEpfStatement(bytes);
    expect(holdings[0].establishment_name).toBe("Example Manufacturing Co");
  });

  it("sets zero_transaction_year=true when the EPFO zero-activity marker row is present, still populating holdings from Closing Balance", async () => {
    const bytes = await buildEpfPdf({
      headerLines: buildPage1TextLines({}),
      tableRows: [
        ["---No Transactions available for the this year.---"],
        ["Closing Balance as on 31/03/2024", "50000", "60000", "5000"],
      ],
    });
    const { holdings, transactions, summary } = await parseEpfStatement(bytes);
    expect(summary.zero_transaction_year).toBe(true);
    expect(transactions.length).toBe(0);
    expect(holdings.length).toBe(1);
    expect(holdings[0].current_value).toBe(115000);
  });

  it("throws 'Could not find Closing Balance in EPF passbook' when no closing-balance row exists", async () => {
    const bytes = await buildEpfPdf({ headerLines: buildPage1TextLines({}) });
    await expect(parseEpfStatement(bytes)).rejects.toThrow("Could not find Closing Balance in EPF passbook");
  });

  it("throws 'Could not find UAN in EPF passbook' when no UAN is present", async () => {
    const bytes = await buildEpfPdf({ headerLines: ["EPF Passbook", "Some unrelated header text"] });
    await expect(parseEpfStatement(bytes)).rejects.toThrow("Could not find UAN in EPF passbook");
  });

  it("parses a contribution row, combining employee+employer+pension into amount", async () => {
    const bytes = await buildEpfPdf({
      headerLines: buildPage1TextLines({}),
      tableRows: [
        ["Wage Month", "Date", "Type", "Particulars", "EPF Wages", "EPS Wages", "Employee", "Employer", "Pension"],
        ["MAR-2024", "05/03/2024", "C", "Contribution", "15000", "15000", "1800", "550", "1250"],
        ["Closing Balance as on 31/03/2024", "50000", "60000", "5000"],
      ],
    });
    const { transactions } = await parseEpfStatement(bytes);
    expect(transactions.length).toBe(1);
    expect(transactions[0].amount).toBe(1800 + 550 + 1250);
    expect(transactions[0].description).toContain("Employee ₹1,800");
    expect(transactions[0].description).toContain("Pension ₹1,250");
  });

  it("skips a contribution row whose combined amount is zero or negative", async () => {
    const bytes = await buildEpfPdf({
      headerLines: buildPage1TextLines({}),
      tableRows: [
        ["Wage Month", "Date", "Type", "Particulars", "EPF Wages", "EPS Wages", "Employee", "Employer", "Pension"],
        ["MAR-2024", "05/03/2024", "C", "Contribution", "0", "0", "0", "0", "0"],
        ["Closing Balance as on 31/03/2024", "50000", "60000", "5000"],
      ],
    });
    const { transactions } = await parseEpfStatement(bytes);
    expect(transactions.length).toBe(0);
  });
});

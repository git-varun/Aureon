import { describe, it, expect } from "vitest";
import PDFDocument from "pdfkit";
import { openPdf, extractText, extractTables } from "./pdfTable";

function buildPdf(opts: { text?: string; userPassword?: string; ownerPassword?: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument(
      opts.userPassword
        ? { userPassword: opts.userPassword, ownerPassword: opts.ownerPassword ?? opts.userPassword, permissions: {} }
        : {},
    );
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.text(opts.text ?? "hello world");
    doc.end();
  });
}

/** Places each cell at a fixed x/y offset (no lineBreak) to simulate a table
 * layout for the coordinate-clustering extractor to recover. */
function buildTablePdf(rows: string[][]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const colX = [50, 200, 320, 420];
    rows.forEach((row, ri) => {
      const y = 100 + ri * 20;
      row.forEach((cell, ci) => {
        doc.text(cell, colX[ci] ?? 50 + ci * 100, y, { lineBreak: false });
      });
    });
    doc.end();
  });
}

describe("openPdf", () => {
  it("opens a plain unencrypted PDF", async () => {
    const bytes = await buildPdf({ text: "Sample CAS statement text" });
    const pdf = await openPdf(bytes);
    expect(pdf.numPages).toBeGreaterThan(0);
  });

  it("throws PDF_PASSWORD_REQUIRED when no password given for an encrypted PDF", async () => {
    const bytes = await buildPdf({ text: "secret", userPassword: "correcthorse" });
    await expect(openPdf(bytes)).rejects.toMatchObject({ message: "PDF_PASSWORD_REQUIRED" });
  });

  it("throws PDF_PASSWORD_INCORRECT when the wrong password is given", async () => {
    const bytes = await buildPdf({ text: "secret", userPassword: "correcthorse" });
    await expect(openPdf(bytes, "wrongpassword")).rejects.toMatchObject({ message: "PDF_PASSWORD_INCORRECT" });
  });

  it("opens successfully with the correct password", async () => {
    const bytes = await buildPdf({ text: "secret", userPassword: "correcthorse" });
    const pdf = await openPdf(bytes, "correcthorse");
    expect(pdf.numPages).toBeGreaterThan(0);
  });

  it("throws the generic invalid-PDF message for non-PDF bytes", async () => {
    await expect(openPdf(Buffer.from("not a pdf at all"))).rejects.toMatchObject({
      message: "This file doesn't appear to be a valid PDF — please check the file and try again.",
    });
  });
});

describe("extractText", () => {
  it("extracts plain text in reading order", async () => {
    const bytes = await buildPdf({ text: "Establishment ID/Name | ABC1234 / Example Corp" });
    const pdf = await openPdf(bytes);
    const page = await pdf.getPage(1);
    const text = await extractText(page);
    expect(text).toContain("Establishment ID/Name");
    expect(text).toContain("ABC1234");
  });
});

describe("extractTables", () => {
  it("clusters text into row/column table cells by coordinate proximity", async () => {
    const bytes = await buildTablePdf([
      ["Scheme Name", "ISIN", "Units", "NAV"],
      ["Fake Growth Fund", "INF000A00000", "100.500", "45.20"],
    ]);
    const pdf = await openPdf(bytes);
    const page = await pdf.getPage(1);
    const tables = await extractTables(page);
    expect(tables.length).toBe(1);
    expect(tables[0][0]).toEqual(["Scheme Name", "ISIN", "Units", "NAV"]);
    expect(tables[0][1][1]).toBe("INF000A00000");
  });

  it("splits a page into multiple logical tables at header-fingerprint boundaries", async () => {
    const bytes = await buildTablePdf([
      ["Folio Header", "A"],
      ["folio-row", "1"],
      ["Holding Header", "B"],
      ["holding-row", "2"],
    ]);
    const pdf = await openPdf(bytes);
    const page = await pdf.getPage(1);
    const isHeader = (row: string[]) => row[0] === "Folio Header" || row[0] === "Holding Header";
    const tables = await extractTables(page, isHeader);
    expect(tables.length).toBe(2);
    expect(tables[0][0][0]).toBe("Folio Header");
    expect(tables[1][0][0]).toBe("Holding Header");
  });
});

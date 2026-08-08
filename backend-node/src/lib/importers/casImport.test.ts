import { describe, it, expect } from "vitest";
import PDFDocument from "pdfkit";
import { parseCdslCas } from "./casImport";

/** Places each cell at a fixed x/y offset to simulate a table layout for the
 * coordinate-clustering extractor to recover, prefixed by optional free text
 * (e.g. a "DP Name: ..." line) placed above the table.
 *
 * Column x-offsets are spaced wide enough that no cell's rendered text runs
 * into the next column's x-position — pdfjs-dist's getTextContent() merges
 * adjacent text runs into a single item when they're close together (unlike
 * pdfplumber's character-level extraction), so tight column spacing with
 * long header text (e.g. "Security Name", "Current Balance") silently
 * collapses two columns into one. This is a genuine limitation of the
 * coordinate-clustering approach used here, not a test-fixture-only concern
 * — see the CAS section of the final phase report. A3-landscape gives
 * enough width to space 9 columns without collision at default font size. */
function buildCasPdf(opts: { preambleText?: string; tables: string[][][] }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A3", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = 60;
    if (opts.preambleText) {
      doc.text(opts.preambleText, 50, y, { lineBreak: false });
      y += 20;
    }
    const colX = [50, 220, 400, 470, 530, 590, 650, 710, 830];
    for (const table of opts.tables) {
      for (const row of table) {
        row.forEach((cell, ci) => {
          doc.text(cell || "-", colX[ci] ?? 50 + ci * 100, y, { lineBreak: false });
        });
        y += 20;
      }
      y += 20; // gap between tables
    }
    doc.end();
  });
}

describe("parseCdslCas", () => {
  it("parses a folio table and computes avg_nav = invested/units", async () => {
    const bytes = await buildCasPdf({
      tables: [
        [
          ["Scheme Name", "ISIN", "Folio No", "Closing Units", "NAV", "Cumulative Invested", "Valuation"],
          ["Fake Growth Fund", "INF000A00000", "12345", "100.000", "50.00", "4500.00", "5000.00"],
        ],
      ],
    });
    const { holdings } = await parseCdslCas(bytes);
    expect(holdings.length).toBe(1);
    expect(holdings[0].symbol).toBe("INF000A00000_MF");
    expect(holdings[0].avg_buy_price).toBeCloseTo(45.0, 2);
    expect(holdings[0].quantity).toBe(100);
  });

  it("drops demat holding-table rows whose ISIN does not start with INF after cleaning", async () => {
    const bytes = await buildCasPdf({
      tables: [
        [
          ["ISIN", "Security Name", "Current Balance", "c4", "c5", "c6", "c7", "Market Price", "Value"],
          ["US0378331005", "Fake Foreign Fund", "50.000", "-", "-", "-", "-", "100.00", "5000.00"],
        ],
      ],
    });
    const { holdings } = await parseCdslCas(bytes);
    expect(holdings.length).toBe(0);
  });

  it("keeps demat holding-table rows with an INF-prefixed ISIN", async () => {
    const bytes = await buildCasPdf({
      tables: [
        [
          ["ISIN", "Security Name", "Current Balance", "c4", "c5", "c6", "c7", "Market Price", "Value"],
          ["INF111B00000", "Fake Domestic Fund", "50.000", "-", "-", "-", "-", "100.00", "5000.00"],
        ],
      ],
    });
    const { holdings } = await parseCdslCas(bytes);
    expect(holdings.length).toBe(1);
    expect(holdings[0].symbol).toBe("INF111B00000_MF");
  });

  it("merges folio and demat holdings by ISIN, summing units on collision (folio precedence for scheme_name/avg_nav)", async () => {
    const bytes = await buildCasPdf({
      tables: [
        [
          ["Scheme Name", "ISIN", "Folio No", "Closing Units", "NAV", "Cumulative Invested", "Valuation"],
          ["Fake Growth Fund", "INF000A00000", "12345", "100.000", "50.00", "4500.00", "5000.00"],
        ],
        [
          ["ISIN", "Security Name", "Current Balance", "c4", "c5", "c6", "c7", "Market Price", "Value"],
          ["INF000A00000", "Fake Growth Fund", "50.000", "-", "-", "-", "-", "50.00", "2500.00"],
        ],
      ],
    });
    const { holdings } = await parseCdslCas(bytes);
    expect(holdings.length).toBe(1);
    expect(holdings[0].quantity).toBe(150); // 100 (folio) + 50 (demat)
    expect(holdings[0].avg_buy_price).toBeCloseTo(45.0, 2); // folio's avg_nav preserved
  });

  it("falls back to a lowercase scheme-name slug when no ISIN is present", async () => {
    const bytes = await buildCasPdf({
      tables: [
        [
          ["Scheme Name", "ISIN", "Folio No", "Closing Units", "NAV", "Cumulative Invested", "Valuation"],
          ["Fake No ISIN Fund", "", "12345", "10.000", "10.00", "90.00", "100.00"],
        ],
      ],
    });
    const { holdings } = await parseCdslCas(bytes);
    expect(holdings[0].symbol).toBe("fake_no_isin_fund_MF");
  });
});

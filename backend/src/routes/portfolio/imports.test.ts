import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { Server } from "http";
import express from "express";
import ExcelJS from "exceljs";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { importsRouter } from "./imports";

async function xlsxFile(rows: unknown[][], filename: string): Promise<FormData> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  for (const row of rows) ws.addRow(row);
  const buf = (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer;
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
  return fd;
}

// No supertest in this repo's devDependencies (checked: none of the existing
// route files use HTTP-level tests, only direct-function DB integration
// tests) — spins up a real Express server on an ephemeral port and issues
// real fetch()/FormData requests instead of adding a new test-HTTP library.
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/portfolio/portfolios", importsRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1/portfolio/portfolios`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

let portfolioId: string;

beforeEach(async () => {
  const p = await testPrisma.portfolio.create({
    data: { id: uuidv4(), name: "test-imports-portfolio", createdAt: new Date(), updatedAt: new Date() },
  });
  portfolioId = p.id;
});

afterEach(async () => {
  await testPrisma.transaction.deleteMany({ where: { portfolioId } });
  await testPrisma.position.deleteMany({ where: { portfolioId } });
  await testPrisma.import_runs.deleteMany({ where: { portfolio_id: portfolioId } });
  await testPrisma.portfolio.delete({ where: { id: portfolioId } });
});

function csvFile(content: string, filename: string): FormData {
  const fd = new FormData();
  fd.append("file", new Blob([content], { type: "text/csv" }), filename);
  return fd;
}

describe("POST /:id/import", () => {
  it("commits valid rows, creates an import_runs record, and dedups on re-import", async () => {
    const csv =
      "Instrument,Series,Trade Date,Trade Type,Quantity,Avg. Price,Exchange,Trade ID\n" +
      "RELIANCE,EQ,2024-01-15,buy,10,2500.5,NSE,T1\n";

    const res1 = await fetch(`${baseUrl}/${portfolioId}/import`, { method: "POST", body: csvFile(csv, "zerodha.csv") });
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { committed: number; skipped: number };
    expect(body1.committed).toBe(1);
    expect(body1.skipped).toBe(0);

    const runs = await testPrisma.import_runs.findMany({ where: { portfolio_id: portfolioId } });
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe("SUCCESS");
    expect(runs[0].rows_committed).toBe(1);

    // Re-import the same file: broker_reference dedup should skip the row.
    const res2 = await fetch(`${baseUrl}/${portfolioId}/import`, { method: "POST", body: csvFile(csv, "zerodha.csv") });
    const body2 = (await res2.json()) as { committed: number; skipped: number };
    expect(body2.committed).toBe(0);
    expect(body2.skipped).toBe(1);

    const pos = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "RELIANCE.NS" } });
    expect(pos).not.toBeNull();
    expect(Number(pos!.quantity)).toBe(10);
  });

  it("returns 400 with rows_skipped/error_summary reported via import_runs for a file with only invalid rows", async () => {
    const csv = "Symbol,Trade Date,Trade Type,Quantity,Price\nRELIANCE,2024-01-15,buy,-5,100\n";
    const res = await fetch(`${baseUrl}/${portfolioId}/import`, { method: "POST", body: csvFile(csv, "bad.csv") });
    expect(res.status).toBe(400);

    const runs = await testPrisma.import_runs.findMany({ where: { portfolio_id: portfolioId } });
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe("FAILED");
  });
});

describe("POST /:id/import/epf", () => {
  it("writes a broker_snapshot transaction for the statement balance and broker_trade rows for contributions, with asset_class=epf", async () => {
    const PDFDocument = (await import("pdfkit")).default;
    const buildPdf = () =>
      new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ size: "A3", layout: "landscape" });
        const chunks: Buffer[] = [];
        doc.on("data", (c) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        const lines = [
          "EPF Passbook",
          "Establishment ID/Name : ABC1234567 / Example Manufacturing Co",
          "Member ID/Name : MBR001 / TEST USER",
          "UAN : 000000000001",
          "Financial Year - 2023-2024",
        ];
        let y = 40;
        for (const line of lines) {
          doc.text(line, 50, y, { lineBreak: false });
          y += 16;
        }
        y += 20;
        const colX = [50, 160, 260, 340, 420, 500, 580, 660, 760];
        const rows = [
          ["Wage Month", "Date", "Type", "Particulars", "EPF Wages", "EPS Wages", "Employee", "Employer", "Pension"],
          ["MAR-2024", "05/03/2024", "C", "Contribution", "15000", "15000", "1800", "550", "1250"],
          ["Closing Balance as on 31/03/2024", "50000", "60000", "5000"],
        ];
        for (const row of rows) {
          row.forEach((cell, ci) => doc.text(cell || "-", colX[ci] ?? 50 + ci * 90, y, { lineBreak: false }));
          y += 16;
        }
        doc.end();
      });

    const bytes = await buildPdf();
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), "epf.pdf");

    const res = await fetch(`${baseUrl}/${portfolioId}/import/epf`, { method: "POST", body: fd });
    expect(res.status).toBe(200);

    const symbol = "EPF-000000000001";
    const asset = await testPrisma.asset.findUnique({ where: { symbol } });
    expect(asset?.assetClass).toBe("epf");

    const snapshot = await testPrisma.transaction.findFirst({
      where: { portfolioId, symbol, kind: "broker_snapshot", broker: "epf" },
    });
    expect(snapshot).not.toBeNull();
    expect(Number(snapshot!.price)).toBe(50000 + 60000 + 5000);

    const contribution = await testPrisma.transaction.findFirst({
      where: { portfolioId, symbol, kind: "broker_trade", broker: "epf" },
    });
    expect(contribution).not.toBeNull();
    expect(Number(contribution!.price)).toBe(1800 + 550 + 1250);
    expect(Number(contribution!.quantity)).toBe(1.0);
  });
});

describe("GET /:id/import/history", () => {
  it("lists import runs and their committed transactions", async () => {
    const csv =
      "Instrument,Series,Trade Date,Trade Type,Quantity,Avg. Price,Exchange,Trade ID\n" +
      "RELIANCE,EQ,2024-01-15,buy,10,2500.5,NSE,T1\n";
    await fetch(`${baseUrl}/${portfolioId}/import`, { method: "POST", body: csvFile(csv, "zerodha.csv") });

    const historyRes = await fetch(`${baseUrl}/${portfolioId}/import/history`);
    const history = (await historyRes.json()) as Array<{ id: string; status: string }>;
    expect(history.length).toBe(1);

    const txnsRes = await fetch(`${baseUrl}/${portfolioId}/import/history/${history[0].id}/transactions`);
    const txns = (await txnsRes.json()) as Array<{ symbol: string }>;
    expect(txns.length).toBe(1);
    expect(txns[0].symbol).toBe("RELIANCE.NS");
  });
});

describe("PUT /:id/manual-assets/:symbol/valuation", () => {
  it("creates the manual asset then revalues it — LatestQuote and a VALUATION txn are updated, quantity is untouched", async () => {
    const createRes = await fetch(`${baseUrl}/${portfolioId}/manual-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My House", asset_class: "real_estate", current_value: 5000000 }),
    });
    expect(createRes.status).toBe(200);
    const { symbol } = (await createRes.json()) as { symbol: string };

    const res = await fetch(`${baseUrl}/${portfolioId}/manual-assets/${symbol}/valuation`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_value: 5500000, notes: "annual revaluation" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; new_price: number };
    expect(body.status).toBe("success");
    // quantity is always 1.0 for lump-sum manual assets, so new_price == new_value.
    expect(body.new_price).toBe(5500000);

    const pos = await testPrisma.position.findFirst({ where: { portfolioId, symbol } });
    expect(Number(pos!.quantity)).toBe(1); // untouched — VALUATION never affects qty

    const quote = await testPrisma.latestQuote.findUnique({ where: { symbol } });
    expect(Number(quote!.price)).toBe(5500000);

    const valuationTxn = await testPrisma.transaction.findFirst({ where: { portfolioId, symbol, transactionType: "VALUATION" } });
    expect(valuationTxn).not.toBeNull();
    expect(valuationTxn!.notes).toBe("annual revaluation");
  });

  it("404s for a symbol with no position in this portfolio", async () => {
    const res = await fetch(`${baseUrl}/${portfolioId}/manual-assets/NOPE/valuation`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_value: 100 }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /:id/import/groww/holdings", () => {
  it("commits a broker_snapshot position, an import_runs record, and current_price to LatestQuote", async () => {
    const form = await xlsxFile(
      [
        ["Groww Stocks Holdings Statement"],
        ["Stock Name", "ISIN", "Quantity", "Average buy price", "Closing price"],
        ["Reliance Industries", "INE002A01018", 10, 2500.5, 2600],
      ],
      "groww_holdings.xlsx",
    );
    const res = await fetch(`${baseUrl}/${portfolioId}/import/groww/holdings`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; imported_holdings: number };
    expect(body.status).toBe("success");
    expect(body.imported_holdings).toBe(1);

    const pos = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "INE002A01018_HOLDING" } });
    expect(pos).not.toBeNull();
    expect(Number(pos!.quantity)).toBe(10);
    expect(Number(pos!.avgBuyPrice)).toBe(2500.5);

    const quote = await testPrisma.latestQuote.findUnique({ where: { symbol: "INE002A01018_HOLDING" } });
    expect(Number(quote!.price)).toBe(2600);

    const runs = await testPrisma.import_runs.findMany({ where: { portfolio_id: portfolioId, source: "groww_holdings" } });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("SUCCESS");
  });

  it("re-import updates the same broker_snapshot row rather than duplicating it", async () => {
    const form1 = await xlsxFile(
      [["Stock Name", "ISIN", "Quantity", "Average buy price"], ["Reliance Industries", "INE002A01018", 10, 2500]],
      "groww_holdings.xlsx",
    );
    await fetch(`${baseUrl}/${portfolioId}/import/groww/holdings`, { method: "POST", body: form1 });

    const form2 = await xlsxFile(
      [["Stock Name", "ISIN", "Quantity", "Average buy price"], ["Reliance Industries", "INE002A01018", 15, 2600]],
      "groww_holdings.xlsx",
    );
    await fetch(`${baseUrl}/${portfolioId}/import/groww/holdings`, { method: "POST", body: form2 });

    const positions = await testPrisma.position.findMany({ where: { portfolioId, symbol: "INE002A01018_HOLDING" } });
    expect(positions).toHaveLength(1);
    expect(Number(positions[0].quantity)).toBe(15);

    const snapshots = await testPrisma.transaction.findMany({
      where: { portfolioId, symbol: "INE002A01018_HOLDING", kind: "broker_snapshot" },
    });
    expect(snapshots).toHaveLength(1); // updated in place, not duplicated
  });

  it("400s (via ImportParseError) when the file has no recognisable holdings header", async () => {
    const form = await xlsxFile([["Not", "A", "Holdings", "File"]], "bad.xlsx");
    const res = await fetch(`${baseUrl}/${portfolioId}/import/groww/holdings`, { method: "POST", body: form });
    expect(res.status).toBe(400);
  });
});

describe("POST /:id/import/groww/mf-holdings", () => {
  it("commits a broker_snapshot MF position with NAV derived from invested/current value", async () => {
    const form = await xlsxFile(
      [
        ["HOLDING SUMMARY"],
        ["Scheme Name", "Folio No.", "Units", "Invested Value", "Current Value"],
        ["Parag Parikh Flexi Cap Fund", "12345", 100, 5000, 6000],
      ],
      "groww_mf_holdings.xlsx",
    );
    const res = await fetch(`${baseUrl}/${portfolioId}/import/groww/mf-holdings`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; imported_holdings: number };
    expect(body.imported_holdings).toBe(1);

    const pos = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "PARAG_PARIKH_FLEXI_CAP_FUND_MF" } });
    expect(pos).not.toBeNull();
    expect(Number(pos!.quantity)).toBe(100);
    expect(Number(pos!.avgBuyPrice)).toBe(50);
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { Server } from "http";
import express from "express";
import PDFDocument from "pdfkit";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { importsRouter } from "./imports";
import { resolvePositionPrice } from "../../lib/prices";

// Confirms the actual cross-phase integration point: an EPF import (Phase 6)
// must feed the already-ported resolvePositionPrice EPF estimate branch
// (Phase 1, src/lib/prices.ts) — the point of the whole kind=broker_snapshot/
// broker_trade wiring in imports.ts.

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
const UAN = "000000000002";
const SYMBOL = `EPF-${UAN}`;

beforeEach(async () => {
  const p = await testPrisma.portfolio.create({
    data: { id: uuidv4(), name: "test-epf-pricing-portfolio", createdAt: new Date(), updatedAt: new Date() },
  });
  portfolioId = p.id;
  await testPrisma.providerConfig.deleteMany({ where: { providerName: "epf_interest_rates" } });
});

afterEach(async () => {
  await testPrisma.transaction.deleteMany({ where: { portfolioId } });
  await testPrisma.position.deleteMany({ where: { portfolioId } });
  await testPrisma.import_runs.deleteMany({ where: { portfolio_id: portfolioId } });
  await testPrisma.portfolio.delete({ where: { id: portfolioId } });
  await testPrisma.providerConfig.deleteMany({ where: { providerName: "epf_interest_rates" } });
});

function buildEpfPdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A3", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const lines = [
      "EPF Passbook",
      "Establishment ID/Name : ABC1234567 / Example Manufacturing Co",
      "Member ID/Name : MBR002 / TEST USER TWO",
      `UAN : ${UAN}`,
      "Financial Year - 2023-2024",
    ];
    let y = 40;
    for (const line of lines) {
      doc.text(line, 50, y, { lineBreak: false });
      y += 16;
    }
    y += 20;
    const colX = [50, 160, 260, 340, 420, 500, 580, 660, 760];
    // Closing balance dated within FY2023-2024 (Jan 2024) so a single seeded
    // rate for that FY covers every month resolvePositionPrice projects.
    const rows = [["Closing Balance as on 15/01/2024", "50000", "60000", "5000"]];
    for (const row of rows) {
      row.forEach((cell, ci) => doc.text(cell || "-", colX[ci] ?? 50 + ci * 90, y, { lineBreak: false }));
      y += 16;
    }
    doc.end();
  });
}

describe("EPF import -> resolvePositionPrice integration", () => {
  it("returns an estimated price once the epf_interest_rates ProviderConfig is seeded", async () => {
    await testPrisma.providerConfig.create({
      data: {
        providerName: "epf_interest_rates",
        providerType: "rates",
        enabled: true,
        keyNames: "[]",
        encryptedKeys: "{}",
        // computeEpfAccrual projects every month from the statement date up
        // to "now" (the real current date), so every FY spanned by that
        // range needs a seeded rate — not just the statement's own FY.
        config: JSON.stringify({
          rates: { "2023-2024": 8.25, "2024-2025": 8.25, "2025-2026": 8.25, "2026-2027": 8.25, "2027-2028": 8.25 },
        }),
        status: "ACTIVE",
        capabilities: "[]",
        priority: 1,
        health: "ok",
        timeoutSeconds: 30,
        retryPolicy: "{}",
      },
    });

    const bytes = await buildEpfPdf();
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), "epf.pdf");
    const res = await fetch(`${baseUrl}/${portfolioId}/import/epf`, { method: "POST", body: fd });
    expect(res.status).toBe(200);

    const position = await testPrisma.position.findFirst({ where: { portfolioId, symbol: SYMBOL } });
    expect(position).not.toBeNull();

    const priced = await resolvePositionPrice(position!);
    expect(priced.unavailable_reason).not.toBe("epf_rate_missing");
    expect(priced.price).not.toBeNull();
    expect(priced.price).toBeGreaterThan(0);
    expect(priced.price_source).toBe("epf_estimated");
  });

  it("returns unavailable_reason=epf_rate_missing when no rate is seeded for the position's FY", async () => {
    const bytes = await buildEpfPdf();
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), "epf.pdf");
    await fetch(`${baseUrl}/${portfolioId}/import/epf`, { method: "POST", body: fd });

    const position = await testPrisma.position.findFirst({ where: { portfolioId, symbol: SYMBOL } });
    const priced = await resolvePositionPrice(position!);
    expect(priced.unavailable_reason).toBe("epf_rate_missing");
    expect(priced.price).toBeNull();
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "http";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { transactionsRouter } from "./transactions";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/portfolio/portfolios", transactionsRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1/portfolio/portfolios`;
});

afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

beforeEach(async () => {
  await testPrisma.position.deleteMany();
  await testPrisma.transaction.deleteMany();
  await testPrisma.portfolio.deleteMany();
});

async function makePortfolio() {
  return testPrisma.portfolio.create({ data: { id: uuidv4(), name: "TxnTest", createdAt: new Date(), updatedAt: new Date() } });
}

async function makeTxn(portfolioId: string, overrides: Record<string, unknown> = {}) {
  return testPrisma.transaction.create({
    data: {
      id: uuidv4(), portfolioId, symbol: "AAPL", transactionType: "BUY", quantity: 10, price: 100,
      transactionDate: new Date(), fees: 0, taxes: 0, kind: "trade", wallet: "spot",
      createdAt: new Date(), updatedAt: new Date(),
      ...overrides,
    },
  });
}

describe("GET /:id/transactions/:txnId", () => {
  it("returns the transaction when it belongs to the URL's portfolio", async () => {
    const p = await makePortfolio();
    const t = await makeTxn(p.id);
    const res = await fetch(`${baseUrl}/${p.id}/transactions/${t.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; symbol: string };
    expect(body.id).toBe(t.id);
    expect(body.symbol).toBe("AAPL");
  });

  it("404s when the transaction belongs to a different portfolio", async () => {
    const p1 = await makePortfolio();
    const p2 = await testPrisma.portfolio.create({ data: { id: uuidv4(), name: "Other", createdAt: new Date(), updatedAt: new Date() } });
    const t = await makeTxn(p1.id);
    const res = await fetch(`${baseUrl}/${p2.id}/transactions/${t.id}`);
    expect(res.status).toBe(404);
  });
});

describe("PUT /:id/transactions/:txnId", () => {
  it("updates fields and recalculates the position", async () => {
    const p = await makePortfolio();
    const t = await makeTxn(p.id, { quantity: 10, price: 100 });
    await testPrisma.position.create({ data: { id: uuidv4(), portfolioId: p.id, symbol: "AAPL", quantity: 10, avgBuyPrice: 100, wallet: "spot", createdAt: new Date(), updatedAt: new Date() } });

    const res = await fetch(`${baseUrl}/${p.id}/transactions/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 20, price: 50 }),
    });
    expect(res.status).toBe(200);

    const pos = await testPrisma.position.findFirst({ where: { portfolioId: p.id, symbol: "AAPL" } });
    expect(Number(pos!.quantity)).toBe(20);
    expect(Number(pos!.avgBuyPrice)).toBe(50);
  });

  it("recalculates both old and new symbol positions when symbol changes", async () => {
    const p = await makePortfolio();
    const t = await makeTxn(p.id, { symbol: "AAPL", quantity: 10, price: 100 });
    await testPrisma.position.create({ data: { id: uuidv4(), portfolioId: p.id, symbol: "AAPL", quantity: 10, avgBuyPrice: 100, wallet: "spot", createdAt: new Date(), updatedAt: new Date() } });

    const res = await fetch(`${baseUrl}/${p.id}/transactions/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "MSFT" }),
    });
    expect(res.status).toBe(200);

    expect(await testPrisma.position.findFirst({ where: { portfolioId: p.id, symbol: "AAPL" } })).toBeNull();
    const newPos = await testPrisma.position.findFirst({ where: { portfolioId: p.id, symbol: "MSFT" } });
    expect(Number(newPos!.quantity)).toBe(10);
  });

  it("404s when the transaction belongs to a different portfolio", async () => {
    const p1 = await makePortfolio();
    const p2 = await testPrisma.portfolio.create({ data: { id: uuidv4(), name: "Other", createdAt: new Date(), updatedAt: new Date() } });
    const t = await makeTxn(p1.id);
    const res = await fetch(`${baseUrl}/${p2.id}/transactions/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: 1 }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects quantity <= 0", async () => {
    const p = await makePortfolio();
    const t = await makeTxn(p.id);
    const res = await fetch(`${baseUrl}/${p.id}/transactions/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 0 }),
    });
    expect(res.status).toBe(422);
  });
});

describe("DELETE /:id/transactions/:txnId", () => {
  it("deletes the transaction and recalculates the position (removing it if qty hits zero)", async () => {
    const p = await makePortfolio();
    const t = await makeTxn(p.id, { quantity: 10, price: 100 });
    await testPrisma.position.create({ data: { id: uuidv4(), portfolioId: p.id, symbol: "AAPL", quantity: 10, avgBuyPrice: 100, wallet: "spot", createdAt: new Date(), updatedAt: new Date() } });

    const res = await fetch(`${baseUrl}/${p.id}/transactions/${t.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { success: boolean }).success).toBe(true);
    expect(await testPrisma.transaction.findUnique({ where: { id: t.id } })).toBeNull();
    expect(await testPrisma.position.findFirst({ where: { portfolioId: p.id, symbol: "AAPL" } })).toBeNull();
  });

  it("404s when the transaction belongs to a different portfolio", async () => {
    const p1 = await makePortfolio();
    const p2 = await testPrisma.portfolio.create({ data: { id: uuidv4(), name: "Other", createdAt: new Date(), updatedAt: new Date() } });
    const t = await makeTxn(p1.id);
    const res = await fetch(`${baseUrl}/${p2.id}/transactions/${t.id}`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("GET /:id/transactions/broker-coverage", () => {
  it("returns the most recent trade/broker_trade date per broker, excluding broker_snapshot", async () => {
    const p = await makePortfolio();
    await makeTxn(p.id, { broker: "zerodha", kind: "trade", transactionDate: new Date("2024-01-01T00:00:00Z") });
    await makeTxn(p.id, { broker: "zerodha", kind: "trade", transactionDate: new Date("2024-06-01T00:00:00Z") });
    // Should be excluded: re-stamped "now" snapshot row that would otherwise
    // dominate the max() and always read as "0 days ago".
    await makeTxn(p.id, { broker: "zerodha", kind: "broker_snapshot", transactionDate: new Date() });
    await makeTxn(p.id, { broker: "binance", kind: "broker_trade", transactionDate: new Date("2024-03-01T00:00:00Z") });

    const res = await fetch(`${baseUrl}/${p.id}/transactions/broker-coverage`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(new Date(body.zerodha).toISOString().slice(0, 10)).toBe("2024-06-01");
    expect(new Date(body.binance).toISOString().slice(0, 10)).toBe("2024-03-01");
  });

  it("is registered before the :txnId route — 'broker-coverage' must not be swallowed as a txn id", async () => {
    const p = await makePortfolio();
    const res = await fetch(`${baseUrl}/${p.id}/transactions/broker-coverage`);
    expect(res.status).toBe(200); // not a 422 UUID-validation error from :txnId matching first
  });
});

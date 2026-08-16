import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "http";
import express from "express";
import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { ensureAssetExists } from "../../lib/assets";
import { positionsRouter } from "./positions";

let server: Server;
let baseUrl: string;
const redis = new Redis(process.env.REDIS_URL!);

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/portfolio/portfolios", positionsRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1/portfolio/portfolios`;

  // Seed the FX rate cache so toInr() hits Redis, not a live network call to
  // open.er-api.com — deterministic and matches Python's own FX_TO_INR
  // fallback constants for a 1:1 predictable USD->INR multiplier in tests.
  await redis.setex("fx:rates", 3600, JSON.stringify({ INR: 1.0, USD: 83.2 }));
});

afterAll(async () => {
  await redis.del("fx:rates");
  await redis.quit();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const TEST_SYMBOLS = ["SNAPCOIN", "SNAPCOIN2", "HISTCOIN"];

beforeEach(async () => {
  await testPrisma.priceHistory.deleteMany({ where: { symbol: { in: TEST_SYMBOLS } } });
  await testPrisma.position.deleteMany();
  await testPrisma.transaction.deleteMany();
  await testPrisma.snapshots.deleteMany();
  await testPrisma.portfolio.deleteMany();
  const assetIds = (await testPrisma.asset.findMany({ where: { symbol: { in: TEST_SYMBOLS } } })).map((a) => a.id);
  if (assetIds.length > 0) {
    await testPrisma.assetSnapshot.deleteMany({ where: { assetId: { in: assetIds } } });
    await testPrisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  }
  const staleKeys = await redis.keys("portfolio:snapshot:*");
  if (staleKeys.length > 0) await redis.del(...staleKeys);
});

async function makePortfolio() {
  return testPrisma.portfolio.create({ data: { id: uuidv4(), name: "SnapTest", createdAt: new Date(), updatedAt: new Date() } });
}

async function makeAsset(symbol: string, assetClass = "crypto") {
  const assetId = await testPrisma.$transaction((tx) => ensureAssetExists(tx, symbol, symbol, assetClass));
  return { id: assetId, symbol };
}

describe("GET/POST /:id/snapshot", () => {
  it("computes market_value from cost-basis price (no quote) normalized to INR, and persists it", async () => {
    const p = await makePortfolio();
    const asset = await makeAsset("SNAPCOIN");
    await testPrisma.position.create({
      data: { id: uuidv4(), portfolioId: p.id, symbol: "SNAPCOIN", assetId: asset.id, quantity: 10, avgBuyPrice: 100, wallet: "spot", createdAt: new Date(), updatedAt: new Date() },
    });

    const res = await fetch(`${baseUrl}/${p.id}/snapshot`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { portfolio_id: string; market_value: number; total_return: number };
    // qty*price = 10*100 = 1000 USD -> * 83.2 = 83200 INR (cost basis == market value, so total_return == 0)
    expect(body.market_value).toBeCloseTo(83200, 0);
    expect(body.total_return).toBeCloseTo(0, 6);

    const row = await testPrisma.snapshots.findUnique({ where: { portfolio_id: p.id } });
    expect(row).not.toBeNull();
    expect(Number(row!.market_value)).toBeCloseTo(83200, 0);
  });

  it("GET serves from cache on a hit, without recomputing (stale cached value returned as-is)", async () => {
    const p = await makePortfolio();
    // Prime the cache directly with a value that would never come from real computation.
    await redis.setex(`portfolio:snapshot:${p.id}`, 900, JSON.stringify({
      portfolio_id: p.id, market_value: 999999, cash_balance: null, daily_return: 0, total_return: 0, updated_at: new Date().toISOString(),
    }));
    const res = await fetch(`${baseUrl}/${p.id}/snapshot`);
    const body = (await res.json()) as { market_value: number };
    expect(body.market_value).toBe(999999);
  });

  it("POST always regenerates, bypassing the cache", async () => {
    const p = await makePortfolio();
    const asset = await makeAsset("SNAPCOIN2");
    await testPrisma.position.create({
      data: { id: uuidv4(), portfolioId: p.id, symbol: "SNAPCOIN2", assetId: asset.id, quantity: 5, avgBuyPrice: 20, wallet: "spot", createdAt: new Date(), updatedAt: new Date() },
    });
    await redis.setex(`portfolio:snapshot:${p.id}`, 900, JSON.stringify({
      portfolio_id: p.id, market_value: 999999, cash_balance: null, daily_return: 0, total_return: 0, updated_at: new Date().toISOString(),
    }));

    const res = await fetch(`${baseUrl}/${p.id}/snapshot`, { method: "POST" });
    const body = (await res.json()) as { market_value: number };
    expect(body.market_value).not.toBe(999999);
    expect(body.market_value).toBeCloseTo(5 * 20 * 83.2, 0);
  });

  it("404s for a nonexistent portfolio", async () => {
    const res = await fetch(`${baseUrl}/${uuidv4()}/snapshot`);
    expect(res.status).toBe(404);
  });
});

describe("GET /:id/history", () => {
  it("returns empty snapshots when there's no trade-ledger history", async () => {
    const p = await makePortfolio();
    const res = await fetch(`${baseUrl}/${p.id}/history`);
    expect(res.status).toBe(200);
    expect((await res.json()) as { snapshots: unknown[] }).toEqual({ snapshots: [] });
  });

  it("rejects out-of-range days", async () => {
    const p = await makePortfolio();
    const res = await fetch(`${baseUrl}/${p.id}/history?days=0`);
    expect(res.status).toBe(422);
    const res2 = await fetch(`${baseUrl}/${p.id}/history?days=99999`);
    expect(res2.status).toBe(422);
  });

  it("reconstructs a value series from BUY transactions + PriceHistory, INR-normalized", async () => {
    const p = await makePortfolio();
    const asset = await makeAsset("HISTCOIN");
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await testPrisma.transaction.create({
      data: {
        id: uuidv4(), portfolioId: p.id, symbol: "HISTCOIN", assetId: asset.id,
        transactionType: "BUY", quantity: 10, price: 50, transactionDate: twoDaysAgo,
        fees: 0, taxes: 0, kind: "trade", wallet: "spot", createdAt: new Date(), updatedAt: new Date(),
      },
    });
    await testPrisma.priceHistory.create({
      data: { id: uuidv4(), assetId: asset.id, symbol: "HISTCOIN", price: 60, timestamp: twoDaysAgo },
    });

    const res = await fetch(`${baseUrl}/${p.id}/history?days=5`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { snapshots: { ts: string; value: number }[] };
    expect(body.snapshots.length).toBeGreaterThan(0);
    // qty=10 * price=60 = 600 USD -> * 83.2 = 49920 INR
    expect(body.snapshots[0].value).toBeCloseTo(49920, 0);
    // Naive-datetime isoformat parity: no "Z"/"+00:00" suffix.
    expect(body.snapshots[0].ts).not.toMatch(/Z|\+00:00$/);
  });
});

describe("POST /:id/sync/binance/backfill", () => {
  it("fails loudly (400) rather than returning a fake queued response — no Node runner exists", async () => {
    const p = await makePortfolio();
    const res = await fetch(`${baseUrl}/${p.id}/sync/binance/backfill`, { method: "POST" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { detail?: string; message?: string };
    expect(JSON.stringify(body)).toMatch(/no runner/i);
  });

  it("404s for a nonexistent portfolio (validated before the ConfigurationError)", async () => {
    const res = await fetch(`${baseUrl}/${uuidv4()}/sync/binance/backfill`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("GET /:id/sync/binance/backfill/status", () => {
  it("returns an all-zero status when no backfill has ever run", async () => {
    const p = await makePortfolio();
    const res = await fetch(`${baseUrl}/${p.id}/sync/binance/backfill/status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { symbols_total: number; symbols_done: number; scope: string };
    expect(body).toMatchObject({ symbols_total: 0, symbols_done: 0, trades_fetched: 0, trades_imported: 0, symbols: [], scope: "spot_only" });
  });

  it("aggregates real checkpoint rows", async () => {
    const p = await makePortfolio();
    await testPrisma.binance_backfill_progress.createMany({
      data: [
        { id: uuidv4(), portfolio_id: p.id, symbol: "BTCUSDT", trades_fetched: 100, trades_imported: 100, done: true, created_at: new Date(), updated_at: new Date() },
        { id: uuidv4(), portfolio_id: p.id, symbol: "ETHUSDT", trades_fetched: 40, trades_imported: 30, done: false, created_at: new Date(), updated_at: new Date() },
      ],
    });
    const res = await fetch(`${baseUrl}/${p.id}/sync/binance/backfill/status`);
    const body = (await res.json()) as { symbols_total: number; symbols_done: number; trades_fetched: number; trades_imported: number };
    expect(body.symbols_total).toBe(2);
    expect(body.symbols_done).toBe(1);
    expect(body.trades_fetched).toBe(140);
    expect(body.trades_imported).toBe(130);
  });

  it("404s for a nonexistent portfolio", async () => {
    const res = await fetch(`${baseUrl}/${uuidv4()}/sync/binance/backfill/status`);
    expect(res.status).toBe(404);
  });
});

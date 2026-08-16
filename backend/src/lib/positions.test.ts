import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { v4 as uuidv4, v5 as uuidv5 } from "uuid";
import { testPrisma } from "../testUtils/testPrisma";
import { recalculatePosition, applyTradeCostBasis } from "./positions";

// Same namespace assets.ts uses for its deterministic uuidv5(symbol) — kept
// in sync here only so cleanup can find the asset_snapshot row
// recalculatePosition -> ensureAssetExists creates as a side effect.
const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const SYMBOL = "TEST-NODE-RECALC";
const assetId = uuidv5(SYMBOL, UUID_NAMESPACE_DNS);

let portfolioId: string;

async function insertTxn(
  overrides: Partial<{
    transactionType: string;
    quantity: number;
    price: number;
    transactionDate: Date;
    kind: string;
    wallet: string;
  }>,
): Promise<void> {
  await testPrisma.transaction.create({
    data: {
      id: uuidv4(),
      portfolioId,
      symbol: SYMBOL,
      transactionType: overrides.transactionType ?? "BUY",
      quantity: overrides.quantity ?? 1,
      price: overrides.price ?? 1,
      transactionDate: overrides.transactionDate ?? new Date(),
      fees: 0,
      taxes: 0,
      kind: overrides.kind ?? "trade",
      wallet: overrides.wallet ?? "spot",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

async function recalc(): Promise<{ quantity: number; avgBuyPrice: number } | null> {
  await testPrisma.$transaction((tx) => recalculatePosition(tx, portfolioId, SYMBOL));
  const pos = await testPrisma.position.findFirst({ where: { portfolioId, symbol: SYMBOL, wallet: "spot" } });
  return pos ? { quantity: Number(pos.quantity), avgBuyPrice: Number(pos.avgBuyPrice) } : null;
}

beforeEach(async () => {
  const portfolio = await testPrisma.portfolio.create({
    data: { id: uuidv4(), name: `vitest-recalc-${uuidv4()}`, isArchived: false, createdAt: new Date(), updatedAt: new Date() },
  });
  portfolioId = portfolio.id;
});

afterEach(async () => {
  // Cascades to this portfolio's positions/transactions.
  await testPrisma.portfolio.delete({ where: { id: portfolioId } });
});

afterAll(async () => {
  await testPrisma.assetSnapshot.deleteMany({ where: { assetId } });
  await testPrisma.$disconnect();
});

describe("recalculatePosition", () => {
  it("BUY creates a position at the trade price", async () => {
    await insertTxn({ transactionType: "BUY", quantity: 10, price: 100 });
    const pos = await recalc();
    expect(pos).toEqual({ quantity: 10, avgBuyPrice: 100 });
  });

  it("a second BUY updates the weighted-average buy price", async () => {
    await insertTxn({ transactionType: "BUY", quantity: 10, price: 100, transactionDate: new Date("2024-01-01") });
    await insertTxn({ transactionType: "BUY", quantity: 10, price: 200, transactionDate: new Date("2024-01-02") });
    const pos = await recalc();
    // (10*100 + 10*200) / 20 = 150
    expect(pos).toEqual({ quantity: 20, avgBuyPrice: 150 });
  });

  it("SELL reduces quantity without changing avg_buy_price, floored at zero", async () => {
    await insertTxn({ transactionType: "BUY", quantity: 10, price: 100, transactionDate: new Date("2024-01-01") });
    await insertTxn({ transactionType: "SELL", quantity: 4, price: 999, transactionDate: new Date("2024-01-02") });
    const pos = await recalc();
    expect(pos).toEqual({ quantity: 6, avgBuyPrice: 100 });
  });

  it("SELL of the full position deletes the row", async () => {
    await insertTxn({ transactionType: "BUY", quantity: 10, price: 100, transactionDate: new Date("2024-01-01") });
    await insertTxn({ transactionType: "SELL", quantity: 10, price: 999, transactionDate: new Date("2024-01-02") });
    const pos = await recalc();
    expect(pos).toBeNull();
  });

  it("BONUS adds shares at its own price into the weighted average", async () => {
    await insertTxn({ transactionType: "BUY", quantity: 10, price: 100, transactionDate: new Date("2024-01-01") });
    await insertTxn({ transactionType: "BONUS", quantity: 10, price: 0, transactionDate: new Date("2024-01-02") });
    const pos = await recalc();
    // (10*100 + 10*0) / 20 = 50
    expect(pos).toEqual({ quantity: 20, avgBuyPrice: 50 });
  });

  it("SPLIT multiplies quantity and divides avg_buy_price by the same factor", async () => {
    await insertTxn({ transactionType: "BUY", quantity: 10, price: 100, transactionDate: new Date("2024-01-01") });
    await insertTxn({ transactionType: "SPLIT", quantity: 0, price: 2, transactionDate: new Date("2024-01-02") });
    const pos = await recalc();
    expect(pos).toEqual({ quantity: 20, avgBuyPrice: 50 });
  });

  it("VALUATION does not touch quantity or avg_buy_price", async () => {
    await insertTxn({ transactionType: "BUY", quantity: 10, price: 100, transactionDate: new Date("2024-01-01") });
    await insertTxn({ transactionType: "VALUATION", quantity: 0, price: 500, transactionDate: new Date("2024-01-02") });
    const pos = await recalc();
    expect(pos).toEqual({ quantity: 10, avgBuyPrice: 100 });
  });

  it("replays a multi-transaction sequence (BUY, BUY, SELL, BONUS) in date order regardless of insert order", async () => {
    // Inserted out of chronological order — recalculatePosition orders by
    // transaction_date, not insertion order.
    await insertTxn({ transactionType: "BONUS", quantity: 5, price: 0, transactionDate: new Date("2024-01-04") });
    await insertTxn({ transactionType: "BUY", quantity: 10, price: 100, transactionDate: new Date("2024-01-01") });
    await insertTxn({ transactionType: "SELL", quantity: 5, price: 999, transactionDate: new Date("2024-01-03") });
    await insertTxn({ transactionType: "BUY", quantity: 10, price: 200, transactionDate: new Date("2024-01-02") });

    const pos = await recalc();
    // Jan 1 BUY 10@100  -> qty 10, avg 100
    // Jan 2 BUY 10@200  -> qty 20, avg (10*100+10*200)/20 = 150
    // Jan 3 SELL 5      -> qty 15, avg unchanged 150
    // Jan 4 BONUS 5@0   -> qty 20, avg (15*150 + 5*0)/20 = 112.5
    expect(pos).toEqual({ quantity: 20, avgBuyPrice: 112.5 });
  });

  it("falls back to the latest broker_snapshot when there is no trade ledger", async () => {
    await insertTxn({ transactionType: "BUY", quantity: 7, price: 42, kind: "broker_snapshot", transactionDate: new Date("2024-01-01") });
    const pos = await recalc();
    expect(pos).toEqual({ quantity: 7, avgBuyPrice: 42 });
  });
});

describe("applyTradeCostBasis", () => {
  let costBasisPortfolioId: string;

  beforeEach(async () => {
    const p = await testPrisma.portfolio.create({
      data: { id: uuidv4(), name: "cost-basis-test", isArchived: false, createdAt: new Date(), updatedAt: new Date() },
    });
    costBasisPortfolioId = p.id;
  });

  afterEach(async () => {
    await testPrisma.portfolio.delete({ where: { id: costBasisPortfolioId } });
  });

  it("derives avg_buy_price from broker_trade rows without touching quantity", async () => {
    await testPrisma.position.create({
      data: {
        id: uuidv4(),
        portfolioId: costBasisPortfolioId,
        symbol: "AAPL",
        quantity: 100,
        avgBuyPrice: 0,
        wallet: "spot",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await testPrisma.transaction.createMany({
      data: [
        {
          id: uuidv4(),
          portfolioId: costBasisPortfolioId,
          symbol: "AAPL",
          transactionType: "BUY",
          quantity: 50,
          price: 10,
          transactionDate: new Date("2024-01-01"),
          fees: 0,
          taxes: 0,
          kind: "broker_trade",
          wallet: "spot",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: uuidv4(),
          portfolioId: costBasisPortfolioId,
          symbol: "AAPL",
          transactionType: "BUY",
          quantity: 50,
          price: 20,
          transactionDate: new Date("2024-01-02"),
          fees: 0,
          taxes: 0,
          kind: "broker_trade",
          wallet: "spot",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    await testPrisma.$transaction((tx) => applyTradeCostBasis(tx, costBasisPortfolioId, "AAPL"));

    const pos = await testPrisma.position.findFirst({ where: { portfolioId: costBasisPortfolioId, symbol: "AAPL" } });
    expect(Number(pos!.avgBuyPrice)).toBe(15); // (50*10 + 50*20) / 100
    expect(Number(pos!.quantity)).toBe(100); // untouched
  });

  it("no-ops when there's no existing Position", async () => {
    await expect(testPrisma.$transaction((tx) => applyTradeCostBasis(tx, costBasisPortfolioId, "NOPOS"))).resolves.not.toThrow();
  });

  it("no-ops when there are no broker_trade rows (kind='trade' rows don't count)", async () => {
    await testPrisma.position.create({
      data: {
        id: uuidv4(),
        portfolioId: costBasisPortfolioId,
        symbol: "MSFT",
        quantity: 10,
        avgBuyPrice: 5,
        wallet: "spot",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await testPrisma.transaction.create({
      data: {
        id: uuidv4(),
        portfolioId: costBasisPortfolioId,
        symbol: "MSFT",
        transactionType: "BUY",
        quantity: 10,
        price: 99,
        transactionDate: new Date(),
        fees: 0,
        taxes: 0,
        kind: "trade",
        wallet: "spot",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await testPrisma.$transaction((tx) => applyTradeCostBasis(tx, costBasisPortfolioId, "MSFT"));
    const pos = await testPrisma.position.findFirst({ where: { portfolioId: costBasisPortfolioId, symbol: "MSFT" } });
    expect(Number(pos!.avgBuyPrice)).toBe(5); // untouched — kind='trade' isn't broker_trade
  });
});

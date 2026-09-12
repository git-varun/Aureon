import { describe, it, expect, afterEach, afterAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../testUtils/testPrisma";
import { generatePortfolioSnapshot } from "./snapshot";

describe("generatePortfolioSnapshot — snapshot_history upsert", () => {
  const portfolioId = uuidv4();

  afterEach(async () => {
    await testPrisma.snapshot_history.deleteMany({ where: { portfolio_id: portfolioId } });
    await testPrisma.snapshots.deleteMany({ where: { portfolio_id: portfolioId } });
    await testPrisma.portfolio.deleteMany({ where: { id: portfolioId } });
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("writes a snapshot_history row for today matching the snapshots row", async () => {
    const now = new Date();
    await testPrisma.portfolio.create({ data: { id: portfolioId, name: "History Test", createdAt: now, updatedAt: now } });

    const result = await generatePortfolioSnapshot(portfolioId);

    const today = new Date().toISOString().slice(0, 10);
    const history = await testPrisma.snapshot_history.findUnique({
      where: { portfolio_id_captured_on: { portfolio_id: portfolioId, captured_on: new Date(today) } },
    });

    expect(history).not.toBeNull();
    expect(Number(history!.market_value)).toBe(result.market_value);
    expect(Number(history!.total_return)).toBe(result.total_return);
  });

  it("overwrites the same day's row instead of accumulating a duplicate", async () => {
    const now = new Date();
    await testPrisma.portfolio.create({ data: { id: portfolioId, name: "History Test", createdAt: now, updatedAt: now } });

    await generatePortfolioSnapshot(portfolioId);
    await generatePortfolioSnapshot(portfolioId);

    const rows = await testPrisma.snapshot_history.findMany({ where: { portfolio_id: portfolioId } });
    expect(rows.length).toBe(1);
  });
});

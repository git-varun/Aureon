import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { createManualAsset } from "./manualAsset";

let portfolioId: string;

beforeEach(async () => {
  const p = await testPrisma.portfolio.create({
    data: { id: uuidv4(), name: "test-manual-asset-portfolio", createdAt: new Date(), updatedAt: new Date() },
  });
  portfolioId = p.id;
});

afterEach(async () => {
  await testPrisma.transaction.deleteMany({ where: { portfolioId } });
  await testPrisma.position.deleteMany({ where: { portfolioId } });
  await testPrisma.portfolio.delete({ where: { id: portfolioId } });
});

describe("createManualAsset", () => {
  it("creates a tradeable manual asset with normal currency inference (no forced currency)", async () => {
    const { symbol } = await testPrisma.$transaction((tx) =>
      createManualAsset(tx, portfolioId, {
        name: "My Private Fund",
        assetClass: "equity",
        symbol: "MY-PRIVATE-FUND",
        quantity: 10,
        price: 100,
      }),
    );
    const asset = await testPrisma.asset.findUniqueOrThrow({ where: { symbol } });
    expect((asset.metadata as Record<string, unknown>).sector).toBe("Manual");
    expect((asset.metadata as Record<string, unknown>).currency).toBeUndefined();
  });

  it("forces INR currency for lump-sum (current_value) manual assets", async () => {
    const { symbol } = await testPrisma.$transaction((tx) =>
      createManualAsset(tx, portfolioId, { name: "My House", assetClass: "real_estate", currentValue: 500000 }),
    );
    const asset = await testPrisma.asset.findUniqueOrThrow({ where: { symbol } });
    expect((asset.metadata as Record<string, unknown>).currency).toBe("INR");
  });

  it("auto-generates a MANUAL-xxxx symbol when no symbol is given for a lump-sum entry", async () => {
    const { symbol } = await testPrisma.$transaction((tx) =>
      createManualAsset(tx, portfolioId, { name: "Fake Asset", assetClass: "other", currentValue: 1000 }),
    );
    expect(symbol).toMatch(/^MANUAL-[0-9A-F]{8}$/);
  });

  it("does not seed a LatestQuote row (LatestQuote's unique key is `symbol`)", async () => {
    const { symbol } = await testPrisma.$transaction((tx) =>
      createManualAsset(tx, portfolioId, { name: "Fake Asset", assetClass: "other", currentValue: 1000 }),
    );
    const quote = await testPrisma.latestQuote.findUnique({ where: { symbol } });
    expect(quote).toBeNull();
  });

  it("throws when neither tradeable fields nor current_value are given", async () => {
    await expect(
      testPrisma.$transaction((tx) => createManualAsset(tx, portfolioId, { name: "Incomplete", assetClass: "other" })),
    ).rejects.toThrow("current_value (or symbol, quantity, and price) is required");
  });

  it("creates a BUY trade transaction and a resulting position with the given quantity/price", async () => {
    const { symbol } = await testPrisma.$transaction((tx) =>
      createManualAsset(tx, portfolioId, {
        name: "My Private Fund",
        assetClass: "equity",
        symbol: "MY-PRIVATE-FUND-2",
        quantity: 10,
        price: 100,
      }),
    );
    const pos = await testPrisma.position.findFirst({ where: { portfolioId, symbol } });
    expect(pos).not.toBeNull();
    expect(Number(pos!.quantity)).toBe(10);
    expect(Number(pos!.avgBuyPrice)).toBe(100);
  });
});

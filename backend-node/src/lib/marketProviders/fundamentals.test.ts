import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { v5 as uuidv5 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { getFundamentals } from "./fundamentals";
import { NotFoundError } from "../errors";

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const SYM_FULL = "TEST-FUND-FULL"; // asset_fundamentals + snapshot + score all present
const SYM_PARTIAL = "TEST-FUND-PARTIAL"; // snapshot only, no asset_fundamentals row
const SYM_NONE = "TEST-FUND-NONE"; // quote only, nothing else
const assetIdFull = uuidv5(SYM_FULL, UUID_NAMESPACE_DNS);
const assetIdPartial = uuidv5(SYM_PARTIAL, UUID_NAMESPACE_DNS);
const assetIdNone = uuidv5(SYM_NONE, UUID_NAMESPACE_DNS);

beforeEach(async () => {
  const now = new Date();
  await testPrisma.asset.createMany({
    data: [
      { id: assetIdFull, symbol: SYM_FULL, name: "Full", assetClass: "equity", createdAt: now, updatedAt: now },
      { id: assetIdPartial, symbol: SYM_PARTIAL, name: "Partial", assetClass: "equity", createdAt: now, updatedAt: now },
      { id: assetIdNone, symbol: SYM_NONE, name: "None", assetClass: "equity", createdAt: now, updatedAt: now },
    ],
  });
  await testPrisma.latestQuote.createMany({
    data: [
      { symbol: SYM_FULL, assetId: assetIdFull, price: 100, createdAt: now, updatedAt: now },
      { symbol: SYM_PARTIAL, assetId: assetIdPartial, price: 50, createdAt: now, updatedAt: now },
      { symbol: SYM_NONE, assetId: assetIdNone, price: 10, createdAt: now, updatedAt: now },
    ],
  });
  await testPrisma.assetSnapshot.createMany({
    data: [
      { assetId: assetIdFull, peRatio: 999, rsi: 60, createdAt: now, updatedAt: now },
      { assetId: assetIdPartial, peRatio: 20, rsi: 40, createdAt: now, updatedAt: now },
    ],
  });
  await testPrisma.assetFundamentals.create({
    data: {
      assetId: assetIdFull,
      trailingPe: 25.5,
      priceToBook: 3.2,
      roe: 0.18,
      debtToEquity: 45, // stored *100-scaled; read-time /100 -> 0.45
      dividendYield: 150, // stored *100-scaled; read-time /100 -> 1.5
      createdAt: now,
      updatedAt: now,
    },
  });
});

afterEach(async () => {
  await testPrisma.assetFundamentals.deleteMany({ where: { assetId: assetIdFull } });
  await testPrisma.assetSnapshot.deleteMany({ where: { assetId: { in: [assetIdFull, assetIdPartial] } } });
  await testPrisma.latestQuote.deleteMany({ where: { symbol: { in: [SYM_FULL, SYM_PARTIAL, SYM_NONE] } } });
  await testPrisma.asset.deleteMany({ where: { symbol: { in: [SYM_FULL, SYM_PARTIAL, SYM_NONE] } } });
});

describe("getFundamentals", () => {
  it("prefers asset_fundamentals.trailing_pe over the older snapshot.pe_ratio, data_source=live", async () => {
    const result = await getFundamentals(SYM_FULL);
    expect(result.pe_ratio).toBe(25.5);
    expect(result.data_source).toBe("live");
  });

  it("normalizes de_ratio/dividend_yield from yfinance's *100 convention to true fractions", async () => {
    const result = await getFundamentals(SYM_FULL);
    expect(result.de_ratio).toBeCloseTo(0.45);
    expect(result.dividend_yield).toBeCloseTo(1.5);
  });

  it("falls back to snapshot.pe_ratio and data_source=partial with no asset_fundamentals row", async () => {
    const result = await getFundamentals(SYM_PARTIAL);
    expect(result.pe_ratio).toBe(20);
    expect(result.data_source).toBe("partial");
    expect(result.pb_ratio).toBeNull();
  });

  it("data_source is null with neither a snapshot nor asset_fundamentals row", async () => {
    const result = await getFundamentals(SYM_NONE);
    expect(result.data_source).toBeNull();
    expect(result.rsi).toBeNull();
  });

  it("always returns null for the 6 fields with no backing source anywhere", async () => {
    const result = await getFundamentals(SYM_FULL);
    expect(result.eps).toBeNull();
    expect(result.beta).toBeNull();
    expect(result.vol_30d).toBeNull();
    expect(result.high_52w).toBeNull();
    expect(result.low_52w).toBeNull();
    expect(result.graham_number).toBeNull();
  });

  it("throws NotFoundError for an unknown symbol", async () => {
    await expect(getFundamentals("TEST-FUND-NOPE")).rejects.toBeInstanceOf(NotFoundError);
  });
});

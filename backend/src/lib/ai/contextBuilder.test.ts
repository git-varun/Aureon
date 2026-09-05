import { describe, it, expect } from "vitest";
import { formatFundamentalsLine } from "./contextBuilder";
import type { AssetFundamentals } from "../../generated/prisma";

const base = (over: Partial<AssetFundamentals>): AssetFundamentals =>
  ({
    assetId: "x",
    trailingPe: null,
    priceToBook: null,
    roe: null,
    debtToEquity: null,
    profitMargin: null,
    revenueGrowth: null,
    dividendYield: null,
    currentRatio: null,
    quickRatio: null,
    grossMargin: null,
    operatingMargin: null,
    eps: null,
    beta: null,
    high52w: null,
    low52w: null,
    marketCap: null,
    circulatingSupply: null,
    totalSupply: null,
    maxSupply: null,
    ath: null,
    atl: null,
    source: "yahoo",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as unknown as AssetFundamentals;

describe("formatFundamentalsLine", () => {
  it("renders real values with fundamentals.ts arithmetic (raw PE/PB, D/E ÷100)", () => {
    // Real AAPL asset_fundamentals row, 2026-09-04.
    const line = formatFundamentalsLine(
      base({
        trailingPe: 37.59565 as never,
        priceToBook: 44.593746 as never,
        roe: 1.4875101 as never,
        debtToEquity: 78.445 as never,
        dividendYield: 0.33 as never,
        beta: 1.086 as never,
      }),
    );
    expect(line).toContain("PE: 37.60");
    expect(line).toContain("P/B: 44.59");
    expect(line).toContain("D/E: 0.78");
    expect(line).toContain("Beta: 1.09");
    // fraction / percent units are explicit in the string, not left to the model
    expect(line).toContain("ROE: 148.8%");
    expect(line).toContain("Div Yield: 0.33%");
  });

  it("returns '' when the row is absent", () => {
    expect(formatFundamentalsLine(null)).toBe("");
  });

  it("returns '' when every emitted field is null (e.g. a crypto row)", () => {
    expect(formatFundamentalsLine(base({ ath: 100 as never }))).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import { positionMarketValueNative, fyNotYetEnded } from "./prices";
import type { Position } from "../generated/prisma";
import type { PositionPrice } from "./prices";

// positionMarketValueNative must stay identical to
// generatePortfolioSnapshot's per-position valuation (snapshot.ts:35-47):
// futures wallets are valued as margin + unrealized PnL, everything else as
// quantity * price.
describe("positionMarketValueNative", () => {
  const basePos = {
    quantity: 10,
    avgBuyPrice: 100,
    wallet: "spot",
    marginUsd: null,
    unrealizedPnl: null,
    leverage: null,
  } as unknown as Position;
  const pp = (price: number | null): PositionPrice =>
    ({ price, currency: "USD" }) as PositionPrice;

  it("values a plain (spot) position as quantity * price", () => {
    expect(positionMarketValueNative(basePos, pp(120))).toBe(1200);
  });

  it("values a spot position with no price as 0", () => {
    expect(positionMarketValueNative(basePos, pp(null))).toBe(0);
  });

  it("values a COIN-M futures position as marginUsd + unrealizedPnl (not qty * price)", () => {
    const pos = { ...basePos, wallet: "futures_coinm", quantity: 5, marginUsd: 250, unrealizedPnl: 99.63 } as unknown as Position;
    expect(positionMarketValueNative(pos, pp(78332.5))).toBeCloseTo(349.63, 2);
  });

  it("values a USD-M futures position as abs(qty*avgBuyPrice)/leverage + unrealizedPnl", () => {
    const pos = { ...basePos, wallet: "futures_usdm", quantity: 0.096, avgBuyPrice: 1550, leverage: 3, unrealizedPnl: 90.045 } as unknown as Position;
    // margin = |0.096 * 1550| / 3 = 49.6 ; + 90.045
    expect(positionMarketValueNative(pos, pp(2477.93))).toBeCloseTo(139.645, 3);
  });
});

// An EPF-rate entry for a financial year that hasn't reached its 31 March end
// is provisional — EPFO only declares the rate at/after year-end. This drives
// the "provisional" flag on the epf_estimate_basis.rates_applied entries.
describe("fyNotYetEnded", () => {
  it("is true for a FY whose 31 March end is still in the future", () => {
    expect(fyNotYetEnded("2026-2027", new Date("2026-09-10T00:00:00Z"))).toBe(true);
  });

  it("is false for a FY that has already ended", () => {
    expect(fyNotYetEnded("2025-2026", new Date("2026-09-10T00:00:00Z"))).toBe(false);
  });

  it("flips exactly at 1 April of the closing year", () => {
    expect(fyNotYetEnded("2026-2027", new Date("2027-03-31T23:59:59Z"))).toBe(true);
    expect(fyNotYetEnded("2026-2027", new Date("2027-04-01T00:00:00Z"))).toBe(false);
  });
});

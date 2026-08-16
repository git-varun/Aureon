import { describe, it, expect } from "vitest";
import { computeEpfAccrual } from "./prices";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

describe("computeEpfAccrual", () => {
  it("applies one month of interest with no FY-end credit yet", () => {
    const result = computeEpfAccrual(
      1000,
      d(2023, 5, 15), // statement: May 2023 (FY 2023-2024)
      d(2023, 6, 15), // now: one month later, June 2023
      [],
      { "2023-2024": 8.15 },
    );
    expect(result.rateMissingForFy).toBeNull();
    expect(result.appliedRates).toEqual({ "2023-2024": 8.15 });
    // principal(1000) + one month's interest (1000 * 8.15% / 12)
    expect(result.estimatedBalance).toBeCloseTo(1006.791667, 5);
  });

  it("returns rateMissingForFy instead of throwing or silently falling back", () => {
    const result = computeEpfAccrual(1000, d(2023, 5, 15), d(2023, 6, 15), [], {});
    expect(result.rateMissingForFy).toBe("2023-2024");
    expect(result.estimatedBalance).toBe(0);
  });

  it("credits the FY's accumulated interest into principal at FY-end (March)", () => {
    const result = computeEpfAccrual(
      1000,
      d(2023, 1, 1), // statement: Jan 2023 (FY 2022-2023)
      d(2023, 3, 15), // now: mid-March 2023 — covers Feb and Mar
      [],
      { "2022-2023": 8 },
    );
    // Feb interest: 1000 * 8% / 12 = 6.6667; Mar interest: still on 1000
    // principal (no contributions) = 6.6667; both credited at March FY-end.
    expect(result.estimatedBalance).toBeCloseTo(1013.333333, 5);
  });

  it("adds a mid-period contribution to principal only after that month's interest, compounding from the next month", () => {
    const result = computeEpfAccrual(
      1000,
      d(2023, 1, 1), // statement: Jan 2023 (FY 2022-2023)
      d(2023, 3, 15), // now: covers Feb and Mar
      [{ date: d(2023, 2, 10), amount: 500 }],
      { "2022-2023": 8 },
    );
    // Feb: interest on 1000 (6.6667), then +500 contribution -> principal 1500.
    // Mar: interest on 1500 (10.0). FY-end credits 6.6667 + 10.0 = 16.6667.
    expect(result.estimatedBalance).toBeCloseTo(1516.666667, 5);
  });

  it("ignores a contribution dated after 'now'", () => {
    const withFuture = computeEpfAccrual(
      1000,
      d(2023, 5, 15),
      d(2023, 6, 15),
      [{ date: d(2023, 7, 1), amount: 999999 }],
      { "2023-2024": 8.15 },
    );
    const withoutFuture = computeEpfAccrual(1000, d(2023, 5, 15), d(2023, 6, 15), [], { "2023-2024": 8.15 });
    expect(withFuture.estimatedBalance).toBeCloseTo(withoutFuture.estimatedBalance, 10);
  });

  it("accrues nothing when statement month and now fall in the same month", () => {
    const result = computeEpfAccrual(1000, d(2023, 5, 15), d(2023, 5, 20), [], { "2023-2024": 8.15 });
    expect(result.estimatedBalance).toBe(1000);
    expect(result.appliedRates).toEqual({});
  });
});

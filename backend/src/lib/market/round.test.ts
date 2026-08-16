import { describe, it, expect } from "vitest";
import { pyRound } from "./round";

describe("pyRound", () => {
  it("rounds a clean half-way value to the nearest even digit (banker's rounding)", () => {
    // (40-15)/40*100 = 62.5 exactly — Python's round(62.5) = 62 (even),
    // not 63 (Math.round's half-up answer). This is the exact
    // _signal_confidence(rsi=15, "BUY") case.
    expect(pyRound(62.5, 0)).toBe(62);
    expect(pyRound(63.5, 0)).toBe(64);
  });

  it("matches Python round() for non-half values", () => {
    expect(pyRound(62.4, 0)).toBe(62);
    expect(pyRound(62.6, 0)).toBe(63);
  });

  it("rounds to N decimal digits, half-to-even", () => {
    expect(pyRound(0.06255, 4)).toBeCloseTo(0.0626, 10); // not a tie at 4dp — normal round
    expect(pyRound(1.00005, 4)).toBe(1.0); // tie at the 4th decimal -> even (0)
  });

  it("handles negative numbers", () => {
    expect(pyRound(-62.5, 0)).toBe(-62);
  });
});

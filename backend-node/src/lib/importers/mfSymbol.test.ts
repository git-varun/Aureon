import { describe, it, expect } from "vitest";
import { cleanIsin, mfSymbolFor, casSymbolFor } from "./mfSymbol";

describe("mfSymbolFor", () => {
  it("uses ISIN-based symbol when cleaned ISIN starts with INF", () => {
    expect(mfSymbolFor("Axis Bluechip Fund", "INF846K01131")).toBe("INF846K01131_MF");
  });

  it("strips separators/case before checking the INF prefix", () => {
    expect(mfSymbolFor("Axis Bluechip Fund", "inf-846k-01131")).toBe("INF846K01131_MF");
  });

  it("falls back to name slug when ISIN is empty", () => {
    expect(mfSymbolFor("Axis Bluechip Fund Direct Growth", "")).toBe("AXIS_BLUECHIP_FUND_DIRECT_GROWTH_MF");
  });

  it("falls back to name slug when ISIN does not start with INF", () => {
    expect(mfSymbolFor("Axis Bluechip Fund", "US0378331005")).toBe("AXIS_BLUECHIP_FUND_MF");
  });

  it("truncates slug to 40 chars before appending _MF, trimming trailing underscore", () => {
    const longName = "A".repeat(50) + " Fund";
    const result = mfSymbolFor(longName, "");
    expect(result).toBe("A".repeat(40) + "_MF");
  });
});

describe("cleanIsin", () => {
  it("strips non-alphanumerics and uppercases", () => {
    expect(cleanIsin(" inf-846k 01131 ")).toBe("INF846K01131");
  });
});

describe("casSymbolFor", () => {
  it("uses lowercase-slug fallback (only the _MF suffix is uppercase), NOT the uppercase mfSymbolFor slug", () => {
    expect(casSymbolFor("Axis Bluechip Fund", "")).toBe("axis_bluechip_fund_MF");
  });

  it("uses ISIN symbol whenever any ISIN is present (no INF-prefix check)", () => {
    expect(casSymbolFor("Axis Bluechip Fund", "US0378331005")).toBe("US0378331005_MF");
  });

  it("uses ISIN symbol for a real INF-prefixed ISIN too", () => {
    expect(casSymbolFor("Axis Bluechip Fund", "INF846K01131")).toBe("INF846K01131_MF");
  });
});

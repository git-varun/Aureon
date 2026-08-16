import { describe, it, expect } from "vitest";
import { evaluateHealthStatus } from "./assetHealth";

// Thresholds under test (from assetHealth.ts): quote SLA=300s, news
// SLA=3600s, signal SLA=3600s, and the STALE/DEGRADED split for an
// unhealthy quote is 3x the quote SLA (900s).
describe("evaluateHealthStatus", () => {
  it("returns UNKNOWN when no dimension has any data at all", () => {
    expect(evaluateHealthStatus(null, null, null)).toBe("UNKNOWN");
  });

  it("returns HEALTHY when quote is fresh and news/signal are absent (missing data doesn't count against health)", () => {
    expect(evaluateHealthStatus(0, null, null)).toBe("HEALTHY");
  });

  it("returns HEALTHY at exactly the quote SLA boundary (300s)", () => {
    expect(evaluateHealthStatus(300, null, null)).toBe("HEALTHY");
  });

  it("returns STALE just past the quote SLA boundary (301s) while still within 3x the SLA", () => {
    expect(evaluateHealthStatus(301, null, null)).toBe("STALE");
  });

  it("returns STALE at exactly the 3x-SLA boundary (900s)", () => {
    expect(evaluateHealthStatus(900, null, null)).toBe("STALE");
  });

  it("returns DEGRADED just past the 3x-SLA boundary (901s)", () => {
    expect(evaluateHealthStatus(901, null, null)).toBe("DEGRADED");
  });

  it("returns DEGRADED when quote is missing but news/signal are present (unhealthy, not merely stale)", () => {
    expect(evaluateHealthStatus(null, 10, 10)).toBe("DEGRADED");
  });

  it("returns HEALTHY when news is present and exactly at its SLA boundary (3600s)", () => {
    expect(evaluateHealthStatus(0, 3600, null)).toBe("HEALTHY");
  });

  it("returns STALE when news is present but just past its SLA boundary (3601s), even though the quote is healthy", () => {
    expect(evaluateHealthStatus(0, 3601, null)).toBe("STALE");
  });

  it("returns HEALTHY when signal is present and exactly at its SLA boundary (3600s)", () => {
    expect(evaluateHealthStatus(0, null, 3600)).toBe("HEALTHY");
  });

  it("returns STALE when signal is present but just past its SLA boundary (3601s), even though the quote is healthy", () => {
    expect(evaluateHealthStatus(0, null, 3601)).toBe("STALE");
  });

  it("returns STALE when quote is healthy but both news and signal are unhealthy", () => {
    expect(evaluateHealthStatus(0, 4000, 4000)).toBe("STALE");
  });
});

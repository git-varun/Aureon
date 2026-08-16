import { describe, it, expect } from "vitest";
import { weightedSentiment } from "./sentiment";

// Reference values computed independently from Python's _weighted_sentiment
// on the same inputs (see the Phase 9 report) — this pins numeric parity,
// not just "it returns a number".
describe("weightedSentiment", () => {
  const now = new Date("2026-08-08T00:00:00.000Z");
  const rows: Array<[number, Date]> = [
    [0.5, new Date("2026-08-07T00:00:00.000Z")], // 1 day old
    [-0.3, new Date("2026-08-05T00:00:00.000Z")], // 3 days old
    [0.8, new Date("2026-08-02T00:00:00.000Z")], // 6 days old
  ];

  it("matches Python's recency-weighted 7d half-life aggregate", () => {
    expect(weightedSentiment(rows, now, 2.0)).toBeCloseTo(0.06949747468305834, 10);
  });

  it("matches Python's recency-weighted 30d half-life aggregate", () => {
    expect(weightedSentiment(rows, now, 7.0)).toBeCloseTo(0.13431969884618722, 10);
  });

  it("returns null for no rows, matching Python's early return", () => {
    expect(weightedSentiment([], now, 2.0)).toBeNull();
  });

  it("shrinks toward neutral when evidence is thin (confidence < 1)", () => {
    // A single article, several half-lives old, contributes a tiny weight —
    // confidence should pull the raw score most of the way to zero.
    const oneStaleRow: Array<[number, Date]> = [[1.0, new Date("2026-07-01T00:00:00.000Z")]];
    const result = weightedSentiment(oneStaleRow, now, 2.0)!;
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(0.01);
  });
});

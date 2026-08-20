import { describe, it, expect } from "vitest";
import { checkCoverage } from "./checkCoverage";

describe("checkCoverage", () => {
  it("reports zero gaps against the current route table and generated collection", () => {
    const result = checkCoverage();
    expect(result.missingFromEndpoints).toEqual([]);
    expect(result.missingFromCollection).toEqual([]);
    expect(result.staleInEndpoints).toEqual([]);
  });
});

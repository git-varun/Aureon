import { describe, it, expect } from "vitest";
import { resolveAndTrackSymbol } from "./resolveAndTrack";
import { testPrisma } from "../../testUtils/testPrisma";

describe("resolveAndTrackSymbol", () => {
  it("no-ops for a query that doesn't look like a plausible ticker (no provider call, no Asset row)", async () => {
    const query = "this is not a ticker at all!!";
    await expect(resolveAndTrackSymbol(query)).resolves.toBeUndefined();
    const asset = await testPrisma.asset.findFirst({ where: { symbol: query.toUpperCase().trim() } });
    expect(asset).toBeNull();
  });
});

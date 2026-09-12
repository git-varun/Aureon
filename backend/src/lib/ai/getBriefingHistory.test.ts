import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBriefingHistory } from "./aiService";
import { prisma } from "../../prisma";

// Regression coverage for the hardcoded briefing_type: "global" filter that
// made weekly/monthly briefings permanently unreachable through the only
// history endpoint even though they're generated and stored.
describe("getBriefingHistory briefing_type filtering", () => {
  const ids = ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"];

  beforeEach(async () => {
    const now = new Date();
    await prisma.ai_briefings.create({
      data: { id: ids[0], briefing_type: "global", content: { market_vibe: "steady" }, model_used: "test", created_at: now, updated_at: now },
    });
    await prisma.ai_briefings.create({
      data: { id: ids[1], briefing_type: "weekly", content: { vibe: "choppy" }, model_used: "test", created_at: now, updated_at: now },
    });
  });

  afterEach(async () => {
    await prisma.ai_briefings.deleteMany({ where: { id: { in: ids } } });
  });

  it("defaults to global-only, matching the endpoint's prior behavior", async () => {
    const result = await getBriefingHistory(30);
    expect(result.some((b) => b.id === ids[0])).toBe(true);
    expect(result.some((b) => b.id === ids[1])).toBe(false);
  });

  it("surfaces weekly briefings when briefingType is passed explicitly", async () => {
    const result = await getBriefingHistory(30, "weekly");
    expect(result.some((b) => b.id === ids[1])).toBe(true);
    expect(result.some((b) => b.id === ids[0])).toBe(false);
  });
});

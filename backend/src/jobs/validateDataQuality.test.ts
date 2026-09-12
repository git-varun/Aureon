import { afterEach, describe, expect, it } from "vitest";
import { validate } from "./validateDataQuality";
import { prisma } from "../prisma";

// Regression coverage: the staleness check used one flat 3-day cutoff for
// every LatestQuote, generating false-positive audit noise for AMFI-sourced
// mutual fund NAVs, which genuinely don't publish on weekends/holidays.
describe("validate — asset-class-aware staleness", () => {
  const symbols = ["TESTMF_STALE_4D", "TESTEQ_STALE_4D"];

  afterEach(async () => {
    await prisma.latestQuote.deleteMany({ where: { symbol: { in: symbols } } });
  });

  it("does not flag a 4-day-old AMFI mutual fund quote as stale, but does flag a same-age equity quote", async () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

    await prisma.latestQuote.create({
      data: { symbol: symbols[0], price: 42.5, provider: "amfi", createdAt: fourDaysAgo, updatedAt: fourDaysAgo },
    });
    await prisma.latestQuote.create({
      data: { symbol: symbols[1], price: 100, provider: "zerodha", createdAt: fourDaysAgo, updatedAt: fourDaysAgo },
    });

    const errors = await validate();

    expect(errors.some((e) => e.includes(symbols[0]) && e.includes("stale"))).toBe(false);
    expect(errors.some((e) => e.includes(symbols[1]) && e.includes("stale"))).toBe(true);
  });
});

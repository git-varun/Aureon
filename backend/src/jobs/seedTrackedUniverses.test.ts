import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { testPrisma } from "../testUtils/testPrisma";

// Two tiny fake universes stand in for the real 5x100-symbol SEED_UNIVERSES
// — checkpointing behavior is under test here, not real quote/history
// fetching, so every network-touching dependency is mocked.
const { ensureTrackedAsset, ingestQuote, backfillHistory, getTopMarketCapCoins, saveQuote } = vi.hoisted(() => ({
  ensureTrackedAsset: vi.fn(),
  ingestQuote: vi.fn(),
  backfillHistory: vi.fn(),
  getTopMarketCapCoins: vi.fn(),
  saveQuote: vi.fn(),
}));
vi.mock("../lib/market/seedUniverses", () => ({ SEED_UNIVERSES: { universe_a: ["SYM_A"], universe_b: ["SYM_B"] } }));
vi.mock("../lib/jobs/ingestionRepo", () => ({ ensureTrackedAsset, saveQuote }));
vi.mock("./ingestQuote", () => ({ ingestQuote }));
vi.mock("../lib/market/backfillHistory", () => ({ backfillHistory }));
vi.mock("../lib/marketProviders/coingecko", () => ({ getTopMarketCapCoins, SYMBOL_TO_COINGECKO_ID: {} }));

import { seedTrackedUniversesTask } from "./seedTrackedUniverses";

const JOB_NAME = "seed_tracked_universes";

describe("seedTrackedUniversesTask — checkpointing", () => {
  beforeEach(async () => {
    ensureTrackedAsset.mockReset().mockImplementation(async (symbol: string) => ({ id: `asset-${symbol}` }));
    ingestQuote.mockReset().mockResolvedValue(true);
    backfillHistory.mockReset().mockResolvedValue(1);
    saveQuote.mockReset().mockResolvedValue("quote-id");
    getTopMarketCapCoins.mockReset().mockResolvedValue([{ id: "bitcoin", symbol: "btc", name: "Bitcoin", price: 50000 }]);
    await testPrisma.jobLog.deleteMany({ where: { jobName: JOB_NAME } });
    // Rare/manual bulk job — disabled by default (jobDefaults.ts); enable it
    // for this suite so skipIfDisabled doesn't short-circuit every test.
    await testPrisma.jobConfig.updateMany({ where: { jobName: JOB_NAME }, data: { enabled: true } });
  });

  afterEach(async () => {
    await testPrisma.jobLog.deleteMany({ where: { jobName: JOB_NAME } });
  });

  afterAll(async () => {
    await testPrisma.jobConfig.updateMany({ where: { jobName: JOB_NAME }, data: { enabled: false } });
    await testPrisma.$disconnect();
  });

  it("completes every phase on a clean run with no prior checkpoint", async () => {
    await seedTrackedUniversesTask();

    expect(ingestQuote).toHaveBeenCalledWith(expect.anything(), "SYM_A");
    expect(ingestQuote).toHaveBeenCalledWith(expect.anything(), "SYM_B");
    expect(getTopMarketCapCoins).toHaveBeenCalledTimes(1);

    const log = await testPrisma.jobLog.findFirst({ where: { jobName: JOB_NAME }, orderBy: { id: "desc" } });
    expect(log?.status).toBe("SUCCESS");
    const summary = log?.resultSummary as Record<string, unknown>;
    expect(Object.keys(summary)).toEqual(["universe_a", "universe_b", "crypto_top100"]);
  });

  it("resumes from a recent interrupted (still-RUNNING) run, skipping phases already checkpointed", async () => {
    // Old enough to clear MIN_ABANDONED_MS (60s) so it reads as abandoned,
    // not a concurrently-active run.
    const abandonedStart = new Date(Date.now() - 5 * 60 * 1000);
    await testPrisma.jobLog.create({
      data: {
        jobName: JOB_NAME,
        status: "RUNNING",
        startedAt: abandonedStart,
        resultSummary: { universe_a: { symbols: 1, quoted: 1, failed: 0, history_rows: 1 } },
      },
    });

    await seedTrackedUniversesTask();

    // universe_a was already checkpointed — its symbol must not be re-quoted.
    expect(ingestQuote).not.toHaveBeenCalledWith(expect.anything(), "SYM_A");
    expect(ingestQuote).toHaveBeenCalledWith(expect.anything(), "SYM_B");
    expect(getTopMarketCapCoins).toHaveBeenCalledTimes(1);

    const log = await testPrisma.jobLog.findFirst({ where: { jobName: JOB_NAME }, orderBy: { id: "desc" } });
    expect(log?.status).toBe("SUCCESS");
    const summary = log?.resultSummary as Record<string, unknown>;
    expect(Object.keys(summary).sort()).toEqual(["crypto_top100", "universe_a", "universe_b"]);
  });

  it("ignores a stale RUNNING checkpoint outside the resume window and starts fresh", async () => {
    const staleStart = new Date(Date.now() - 25 * 60 * 60 * 1000); // > 24h old
    await testPrisma.jobLog.create({
      data: {
        jobName: JOB_NAME,
        status: "RUNNING",
        startedAt: staleStart,
        resultSummary: { universe_a: { symbols: 1, quoted: 1, failed: 0, history_rows: 1 } },
      },
    });

    await seedTrackedUniversesTask();

    // Stale checkpoint must not be trusted — universe_a is redone.
    expect(ingestQuote).toHaveBeenCalledWith(expect.anything(), "SYM_A");
    expect(ingestQuote).toHaveBeenCalledWith(expect.anything(), "SYM_B");
  });

  it("never resumes from a FAILED row, even one recent and within the resume window", async () => {
    // sweepStaleRunningJobs never clears resultSummary when it closes a
    // stale row out as FAILED, and a real provider/code error also leaves a
    // FAILED row with whatever phases happened to complete first — neither
    // case should be trusted as "safe to skip these phases forever."
    const recentStart = new Date(Date.now() - 5 * 60 * 1000);
    await testPrisma.jobLog.create({
      data: {
        jobName: JOB_NAME,
        status: "FAILED",
        startedAt: recentStart,
        endedAt: recentStart,
        errorMessage: "some real failure, not the stale-job sweep",
        resultSummary: { universe_a: { symbols: 1, quoted: 1, failed: 0, history_rows: 1 } },
      },
    });

    await seedTrackedUniversesTask();

    expect(ingestQuote).toHaveBeenCalledWith(expect.anything(), "SYM_A");
    expect(ingestQuote).toHaveBeenCalledWith(expect.anything(), "SYM_B");
  });

  it("does not resume from a RUNNING row started moments ago (possible concurrent run, not abandoned)", async () => {
    await testPrisma.jobLog.create({
      data: {
        jobName: JOB_NAME,
        status: "RUNNING",
        startedAt: new Date(), // well within MIN_ABANDONED_MS
        resultSummary: { universe_a: { symbols: 1, quoted: 1, failed: 0, history_rows: 1 } },
      },
    });

    await seedTrackedUniversesTask();

    // Too recent to trust as abandoned — must not skip universe_a based on
    // a run that might still be actively in progress elsewhere.
    expect(ingestQuote).toHaveBeenCalledWith(expect.anything(), "SYM_A");
    expect(ingestQuote).toHaveBeenCalledWith(expect.anything(), "SYM_B");
  });

  it("checkpoints progress into the running job_log row as each phase finishes", async () => {
    let resultSummaryDuringRun: unknown;
    ingestQuote.mockImplementation(async (_provider: string, symbol: string) => {
      if (symbol === "SYM_B") {
        const runningLog = await testPrisma.jobLog.findFirst({ where: { jobName: JOB_NAME, status: "RUNNING" } });
        resultSummaryDuringRun = runningLog?.resultSummary;
      }
      return true;
    });

    await seedTrackedUniversesTask();

    // By the time universe_b's phase starts, universe_a's phase must already
    // be durably persisted on the RUNNING row — not just held in memory.
    expect(resultSummaryDuringRun).toMatchObject({ universe_a: expect.anything() });
  });
});

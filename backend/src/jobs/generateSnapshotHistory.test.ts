import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../testUtils/testPrisma";

const { generatePortfolioSnapshot } = vi.hoisted(() => ({ generatePortfolioSnapshot: vi.fn() }));
vi.mock("../lib/snapshot", () => ({ generatePortfolioSnapshot }));

import { generateSnapshotHistoryTask } from "./generateSnapshotHistory";

describe("generateSnapshotHistoryTask", () => {
  const portfolioIdA = uuidv4();
  const portfolioIdB = uuidv4();

  beforeEach(async () => {
    // Default to the real implementation — only the all-portfolios-fail
    // test below overrides this, so every other test still exercises real
    // snapshot_history writes against the test DB.
    const actual = await vi.importActual<typeof import("../lib/snapshot")>("../lib/snapshot");
    generatePortfolioSnapshot.mockImplementation(actual.generatePortfolioSnapshot);
  });

  afterEach(async () => {
    await testPrisma.snapshot_history.deleteMany({ where: { portfolio_id: { in: [portfolioIdA, portfolioIdB] } } });
    await testPrisma.snapshots.deleteMany({ where: { portfolio_id: { in: [portfolioIdA, portfolioIdB] } } });
    await testPrisma.portfolio.deleteMany({ where: { id: { in: [portfolioIdA, portfolioIdB] } } });
    await testPrisma.jobLog.deleteMany({ where: { jobName: "generate_snapshot_history" } });
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("writes a snapshot_history row for every portfolio and logs SUCCESS", async () => {
    const now = new Date();
    await testPrisma.portfolio.create({ data: { id: portfolioIdA, name: "History Job Test A", createdAt: now, updatedAt: now } });
    await testPrisma.portfolio.create({ data: { id: portfolioIdB, name: "History Job Test B", createdAt: now, updatedAt: now } });

    await generateSnapshotHistoryTask();

    const rowsA = await testPrisma.snapshot_history.findMany({ where: { portfolio_id: portfolioIdA } });
    const rowsB = await testPrisma.snapshot_history.findMany({ where: { portfolio_id: portfolioIdB } });
    expect(rowsA.length).toBe(1);
    expect(rowsB.length).toBe(1);

    const log = await testPrisma.jobLog.findFirst({ where: { jobName: "generate_snapshot_history" }, orderBy: { id: "desc" } });
    expect(log?.status).toBe("SUCCESS");
  });

  it("logs FAILED instead of a silently-empty SUCCESS when every portfolio's snapshot generation fails", async () => {
    const now = new Date();
    await testPrisma.portfolio.create({ data: { id: portfolioIdA, name: "History Job Test A", createdAt: now, updatedAt: now } });
    await testPrisma.portfolio.create({ data: { id: portfolioIdB, name: "History Job Test B", createdAt: now, updatedAt: now } });
    generatePortfolioSnapshot.mockRejectedValue(new Error("price provider down"));

    // wrapJobExecution logs FAILED then re-throws — this is a fire-and-forget
    // job in production (jobDispatch.ts's dispatchWithRunner swallows the
    // rejection), so the JobLog row, not the promise settling, is the signal
    // under test.
    await expect(generateSnapshotHistoryTask()).rejects.toThrow();

    const rows = await testPrisma.snapshot_history.findMany({ where: { portfolio_id: { in: [portfolioIdA, portfolioIdB] } } });
    expect(rows.length).toBe(0);

    const log = await testPrisma.jobLog.findFirst({ where: { jobName: "generate_snapshot_history" }, orderBy: { id: "desc" } });
    expect(log?.status).toBe("FAILED");
  });
});

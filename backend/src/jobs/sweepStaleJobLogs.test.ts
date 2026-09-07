import { describe, it, expect, afterEach, afterAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../testUtils/testPrisma";
import { sweepStaleJobLogsTask } from "./sweepStaleJobLogs";

// BUG-S: one provider_usage row is written per get_quote and nothing reads
// the table, so it grew unbounded. sweep_stale_job_logs now also prunes rows
// older than 90 days. The table is younger than 90d in every real DB, so the
// deletion path can only be proven here, not by live prod data.
describe("sweepStaleJobLogsTask — provider_usage prune (BUG-S)", () => {
  const providerId = uuidv4();
  const day = 24 * 60 * 60 * 1000;
  const oldId = uuidv4();
  const recentId = uuidv4();

  afterEach(async () => {
    await testPrisma.providerUsage.deleteMany({ where: { providerId } });
    await testPrisma.provider.deleteMany({ where: { id: providerId } });
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("deletes rows older than 90 days, keeps recent rows, reports the count as SUCCESS", async () => {
    const now = new Date();
    await testPrisma.provider.create({
      data: { id: providerId, name: `bug-s-test-${providerId}`, isEnabled: true, createdAt: now, updatedAt: now },
    });
    await testPrisma.providerUsage.createMany({
      data: [
        { id: oldId, providerId, endpoint: "get_quote", requestCount: 1, costEstimate: 0, recordedAt: new Date(Date.now() - 91 * day), createdAt: now, updatedAt: now },
        { id: recentId, providerId, endpoint: "get_quote", requestCount: 1, costEstimate: 0, recordedAt: new Date(Date.now() - 89 * day), createdAt: now, updatedAt: now },
      ],
    });

    await sweepStaleJobLogsTask();

    expect(await testPrisma.providerUsage.findUnique({ where: { id: oldId } })).toBeNull();
    expect(await testPrisma.providerUsage.findUnique({ where: { id: recentId } })).not.toBeNull();

    const log = await testPrisma.jobLog.findFirst({
      where: { jobName: "sweep_stale_job_logs" },
      orderBy: { id: "desc" },
    });
    expect(log?.status).toBe("SUCCESS");
    const summary = log?.resultSummary as { providerUsagePruned: number };
    expect(summary.providerUsagePruned).toBeGreaterThanOrEqual(1);
  });
});

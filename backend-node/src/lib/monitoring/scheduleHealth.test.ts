import { describe, it, expect, afterEach, afterAll } from "vitest";
import { testPrisma } from "../../testUtils/testPrisma";
import { getScheduledJobHealth, checkScheduledJobsHealth } from "./scheduleHealth";

const JOB_NAME = "sweep_stale_job_logs";

async function insertSuccess(startedAt: Date): Promise<void> {
  await testPrisma.jobLog.create({
    data: { jobName: JOB_NAME, status: "SUCCESS", startedAt, endedAt: startedAt, durationMs: 10 },
  });
}

afterEach(async () => {
  await testPrisma.jobLog.deleteMany({ where: { jobName: JOB_NAME } });
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

// Reproduces, at the unit level, the live gap this monitor exists to catch:
// upsertJobScheduler silently skipped two consecutive */30 fires after a
// worker restart against warm Redis state (confirmed live 2026-08-10 —
// see docs/superpowers/plans/2026-08-11-python-to-node-full-migration.md
// Task 3, and taskforcesh/bullmq#3048/#3197/#3381/#3430/#2466). The
// registered job (sweep_stale_job_logs) has a 30min interval and a 1.5x
// staleness multiplier, so 45min is the exact healthy/stale boundary.
describe("getScheduledJobHealth", () => {
  it("reports never_run when no SUCCESS row exists for a registered job", async () => {
    const results = await getScheduledJobHealth();
    const sweep = results.find((r) => r.job_name === JOB_NAME)!;
    expect(sweep.status).toBe("never_run");
    expect(sweep.minutes_since_last_success).toBeNull();
  });

  it("reports healthy when the last success is within 1.5x the interval", async () => {
    await insertSuccess(new Date(Date.now() - 10 * 60_000));
    const results = await getScheduledJobHealth();
    const sweep = results.find((r) => r.job_name === JOB_NAME)!;
    expect(sweep.status).toBe("healthy");
  });

  it("reports stale once the last success exceeds 1.5x the interval (the missed-cycle case)", async () => {
    // 50min > 45min threshold — matches the shape of the live gap (two
    // missed 30min cycles), not just a hair over the line.
    await insertSuccess(new Date(Date.now() - 50 * 60_000));
    const results = await getScheduledJobHealth();
    const sweep = results.find((r) => r.job_name === JOB_NAME)!;
    expect(sweep.status).toBe("stale");
    expect(sweep.minutes_since_last_success).toBeGreaterThan(45);
  });

  it("only counts SUCCESS rows — a stale FAILED row doesn't mask a real gap", async () => {
    await testPrisma.jobLog.create({
      data: { jobName: JOB_NAME, status: "FAILED", startedAt: new Date(), endedAt: new Date(), errorMessage: "boom" },
    });
    const results = await getScheduledJobHealth();
    const sweep = results.find((r) => r.job_name === JOB_NAME)!;
    expect(sweep.status).toBe("never_run");
  });
});

describe("checkScheduledJobsHealth", () => {
  it("collapses a stale job into a single descriptive string", async () => {
    await insertSuccess(new Date(Date.now() - 50 * 60_000));
    const status = await checkScheduledJobsHealth();
    expect(status).toContain("sweep_stale_job_logs: stale");
  });

  it("returns \"healthy\" when every registered job is within its interval", async () => {
    await insertSuccess(new Date(Date.now() - 5 * 60_000));
    const status = await checkScheduledJobsHealth();
    expect(status).toBe("healthy");
  });
});

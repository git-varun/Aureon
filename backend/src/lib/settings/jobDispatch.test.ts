import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { testPrisma } from "../../testUtils/testPrisma";
import { dispatchJob } from "./jobDispatch";
import { ConfigurationError } from "../errors";

// dispatchJob/dispatchWithRunner read/write the real prisma singleton (../../prisma),
// not testPrisma — this suite relies on that singleton pointing at the same
// aureon_test database testPrisma does (see prisma.ts / TEST_DATABASE_URL).

const JOB_NAME = "sync_zerodha";
const PROVIDER_NAME = "zerodha";

let jobWasEnabled: boolean;
let providerWasEnabled: boolean;

beforeEach(async () => {
  const job = await testPrisma.jobConfig.findUniqueOrThrow({ where: { jobName: JOB_NAME } });
  jobWasEnabled = job.enabled;
  await testPrisma.jobConfig.update({ where: { jobName: JOB_NAME }, data: { enabled: true } });

  const provider = await testPrisma.providerConfig.findUniqueOrThrow({ where: { providerName: PROVIDER_NAME } });
  providerWasEnabled = provider.enabled;
  await testPrisma.providerConfig.update({ where: { providerName: PROVIDER_NAME }, data: { enabled: false } });
});

afterEach(async () => {
  await testPrisma.jobConfig.update({ where: { jobName: JOB_NAME }, data: { enabled: jobWasEnabled } });
  await testPrisma.providerConfig.update({ where: { providerName: PROVIDER_NAME }, data: { enabled: providerWasEnabled } });
});

describe("dispatchJob — provider-not-configured path leaves an auditable JobLog", () => {
  it(
    "throws ConfigurationError AND writes a FAILED JobLog row with the provider-not-configured message " +
      "(port of Python's dispatch_job: acquire lock -> log_job_start -> provider check -> on failure, " +
      "release lock + log_job_end(FAILED, message) + raise — the JobLog must exist even though dispatch " +
      "itself was rejected, so GET /config/jobs/logs / the Job History UI doesn't silently lose the attempt)",
    async () => {
      await expect(dispatchJob(JOB_NAME)).rejects.toThrow(ConfigurationError);
      await expect(dispatchJob(JOB_NAME)).rejects.toThrow(/Provider 'zerodha' is not configured \(status=PARTIAL\) — job not dispatched/);

      const logs = await testPrisma.jobLog.findMany({ where: { jobName: JOB_NAME }, orderBy: { startedAt: "desc" } });
      expect(logs.length).toBeGreaterThanOrEqual(2); // one per rejected dispatch attempt above
      for (const log of logs.slice(0, 2)) {
        expect(log.status).toBe("FAILED");
        expect(log.errorMessage).toMatch(/Provider 'zerodha' is not configured \(status=PARTIAL\) — job not dispatched/);
      }
    },
  );
});

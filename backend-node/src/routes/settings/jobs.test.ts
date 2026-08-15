import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "http";
import express from "express";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { jobsRouter } from "./jobs";
import { seedDefaultJobs, DEFAULT_JOBS } from "../../lib/settings/jobDefaults";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/config", jobsRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1/config`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  await testPrisma.jobLog.deleteMany();
  await testPrisma.jobConfig.deleteMany();
  await seedDefaultJobs();
});

describe("jobs settings", () => {
  it("lists every seeded job", async () => {
    const res = await fetch(`${baseUrl}/jobs`);
    const body = (await res.json()) as { jobs: unknown[] };
    expect(body.jobs).toHaveLength(DEFAULT_JOBS.length); // don't hardcode the count
  });

  it("GET /jobs/logs (static path) is not shadowed by /jobs/:job_name", async () => {
    const res = await fetch(`${baseUrl}/jobs/logs`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: unknown[]; total: number };
    expect(body).toHaveProperty("logs");
    expect(body).toHaveProperty("total");
  });

  it("disabling a job then running it returns 409, no dispatch", async () => {
    await fetch(`${baseUrl}/jobs/refresh_prices`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    const res = await fetch(`${baseUrl}/jobs/refresh_prices/run`, { method: "POST" });
    expect(res.status).toBe(409);
  });

  it("running a job with no Node runner fails loudly, not silently", async () => {
    // refresh_fundamentals gained a real Node runner in Task 7 —
    // sync_portfolio is still unported (deliberately out of scope, see
    // sync.ts's comment / task4-report.md / task7-report.md), so it's the
    // current example of "seeded in job_configs but not dispatchable".
    const res = await fetch(`${baseUrl}/jobs/sync_portfolio/run`, { method: "POST" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("404s for an unknown job name", async () => {
    const res = await fetch(`${baseUrl}/jobs/not_a_job/run`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});

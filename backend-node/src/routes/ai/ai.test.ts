import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "http";
import express from "express";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { aiRouter } from "./ai";
import { recommendationSeedRouter } from "./recommendations";
import { seedDefaultJobs } from "../../lib/settings/jobDefaults";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", aiRouter);
  app.use("/api/v1", recommendationSeedRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  await testPrisma.jobLog.deleteMany();
  await testPrisma.jobConfig.deleteMany();
  await seedDefaultJobs();
});

describe("POST /analytics/ai/news/batch", () => {
  it("dispatches the fetch_news job and returns a queued task_id", async () => {
    const res = await fetch(`${baseUrl}/analytics/ai/news/batch`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; task_id: string };
    expect(body.status).toBe("queued");
    expect(typeof body.task_id).toBe("string");
  });
});

describe("POST /aureon/recommendations/seed", () => {
  it("returns the seed-response envelope with no held assets", async () => {
    const res = await fetch(`${baseUrl}/aureon/recommendations/seed`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; count: number; items: unknown[] };
    expect(body).toEqual({ status: "success", count: 0, items: [] });
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "http";
import express from "express";
import { v4 as uuidv4 } from "uuid";
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

describe("GET /analytics/ai/usage", () => {
  const genId1 = uuidv4();
  const genId2 = uuidv4();

  beforeEach(async () => {
    await testPrisma.ai_generations.deleteMany({ where: { id: { in: [genId1, genId2] } } });
    const now = new Date();
    await testPrisma.ai_generations.create({
      data: {
        id: genId1,
        feature_name: "single",
        provider: "gemini",
        model: "gemini-test-model",
        prompt_text: "p1",
        response_text: "r1",
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        latency_ms: 100,
        payload_retention_state: "full",
        generation_parameters: {},
        created_at: now,
        updated_at: now,
      },
    });
    await testPrisma.ai_generations.create({
      data: {
        id: genId2,
        feature_name: "single",
        provider: "gemini",
        model: "gemini-test-model",
        prompt_text: "p2",
        response_text: "r2",
        prompt_tokens: 20,
        completion_tokens: 10,
        total_tokens: 30,
        latency_ms: 200,
        error_message: "boom",
        payload_retention_state: "full",
        generation_parameters: {},
        created_at: now,
        updated_at: now,
      },
    });
  });

  afterAll(async () => {
    await testPrisma.ai_generations.deleteMany({ where: { id: { in: [genId1, genId2] } } });
  });

  it("aggregates token usage by provider/model, counting only non-null error_message rows", async () => {
    const res = await fetch(`${baseUrl}/analytics/ai/usage`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      by_model: { provider: string; model: string; generation_count: number; total_tokens: number; error_count: number }[];
    };
    const row = body.by_model.find((m) => m.model === "gemini-test-model");
    expect(row).toBeDefined();
    expect(row?.generation_count).toBe(2);
    expect(row?.total_tokens).toBe(45);
    expect(row?.error_count).toBe(1);
  });

  it("filters by since/until", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await fetch(`${baseUrl}/analytics/ai/usage?since=${future}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { by_model: unknown[]; total_generations: number };
    expect(body.by_model.find((m) => (m as { model: string }).model === "gemini-test-model")).toBeUndefined();
  });

  it("422s on a malformed date", async () => {
    const res = await fetch(`${baseUrl}/analytics/ai/usage?since=not-a-date`);
    expect(res.status).toBe(422);
  });
});

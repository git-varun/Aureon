import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "http";
import express from "express";
import Redis from "ioredis";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { ensureAssetExists } from "../../lib/assets";
import { getAssetScoresKey } from "../../lib/evaluation/cache";
import { evaluationRouter } from "./evaluation";

let server: Server;
let baseUrl: string;
const redis = new Redis(process.env.REDIS_URL!);

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/evaluation", evaluationRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1/evaluation`;
});

afterAll(async () => {
  if (assetId) {
    await testPrisma.assetScore.deleteMany({ where: { assetId } });
    await testPrisma.assetSnapshot.deleteMany({ where: { assetId } });
    await testPrisma.asset.deleteMany({ where: { id: assetId } });
  }
  await redis.quit();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const TEST_SYMBOL = "EVALSCORETEST";
let assetId: string;

beforeEach(async () => {
  assetId = await testPrisma.$transaction((tx) => ensureAssetExists(tx, TEST_SYMBOL, "Eval Score Test Asset"));
  await testPrisma.assetScore.deleteMany({ where: { assetId } });
  await redis.del(getAssetScoresKey(assetId));
});

describe("GET /evaluation/assets/:assetId/scores", () => {
  it("422s on a malformed asset_id (mirrors FastAPI's uuid.UUID path-param validation)", async () => {
    const res = await fetch(`${baseUrl}/assets/not-a-uuid/scores`);
    expect(res.status).toBe(422);
  });

  it("404s when no scores row exists for the asset/model_version, no cache fallback", async () => {
    const res = await fetch(`${baseUrl}/assets/${assetId}/scores`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toBe("Asset scores not found");
  });

  it("returns the DB row for the default model_version (v1.0.0), converting Decimal fields to numbers", async () => {
    const generatedAt = new Date("2026-01-01T00:00:00.000Z");
    await testPrisma.assetScore.create({
      data: {
        assetId,
        modelVersion: "v1.0.0",
        recommendationScore: 0.6123,
        qualityScore: null,
        valuationScore: null,
        unavailableInputs: ["quality_score", "valuation_score"],
        generatedAt,
      },
    });

    const res = await fetch(`${baseUrl}/assets/${assetId}/scores`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      asset_id: string;
      model_version: string;
      recommendation_score: number | null;
      quality_score: number | null;
      valuation_score: number | null;
      unavailable_inputs: string[];
      generated_at: string;
    };
    expect(body).toEqual({
      asset_id: assetId,
      model_version: "v1.0.0",
      recommendation_score: 0.6123,
      quality_score: null,
      valuation_score: null,
      unavailable_inputs: ["quality_score", "valuation_score"],
      generated_at: generatedAt.toISOString(),
    });
  });

  it("looks up a non-default model_version via the query param", async () => {
    const generatedAt = new Date("2026-02-02T00:00:00.000Z");
    await testPrisma.assetScore.create({
      data: {
        assetId,
        modelVersion: "v2.0.0",
        recommendationScore: 0.75,
        qualityScore: 0.5,
        valuationScore: 0.25,
        unavailableInputs: [],
        generatedAt,
      },
    });

    const res = await fetch(`${baseUrl}/assets/${assetId}/scores?model_version=v2.0.0`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { model_version: string; recommendation_score: number };
    expect(body.model_version).toBe("v2.0.0");
    expect(body.recommendation_score).toBe(0.75);
  });

  it("serves from cache on a hit for the matching model_version, without querying the DB row", async () => {
    await redis.setex(
      getAssetScoresKey(assetId),
      900,
      JSON.stringify({
        asset_id: assetId,
        model_version: "v1.0.0",
        recommendation_score: 0.999,
        quality_score: null,
        valuation_score: null,
        unavailable_inputs: [],
        generated_at: "2020-01-01T00:00:00.000Z",
      }),
    );
    // No DB row exists for this asset/model_version — a 200 with the cached
    // value (rather than a 404) proves the cache short-circuits the DB read.
    const res = await fetch(`${baseUrl}/assets/${assetId}/scores`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recommendation_score: number };
    expect(body.recommendation_score).toBe(0.999);
  });

  it("ignores a cached value for a different model_version and falls through to the DB", async () => {
    await redis.setex(
      getAssetScoresKey(assetId),
      900,
      JSON.stringify({
        asset_id: assetId,
        model_version: "v9.9.9",
        recommendation_score: 0.111,
        quality_score: null,
        valuation_score: null,
        unavailable_inputs: [],
        generated_at: "2020-01-01T00:00:00.000Z",
      }),
    );
    const generatedAt = new Date("2026-03-03T00:00:00.000Z");
    await testPrisma.assetScore.create({
      data: {
        assetId,
        modelVersion: "v1.0.0",
        recommendationScore: 0.42,
        qualityScore: null,
        valuationScore: null,
        unavailableInputs: [],
        generatedAt,
      },
    });

    const res = await fetch(`${baseUrl}/assets/${assetId}/scores`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { model_version: string; recommendation_score: number };
    expect(body.model_version).toBe("v1.0.0");
    expect(body.recommendation_score).toBe(0.42);
  });
});

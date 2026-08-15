import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { Server } from "http";
import express from "express";
import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { recommendationRouter } from "./recommendations";

// Port-verification for Task 5's apply/dismiss/undo — the pieces
// contextBuilder.test.ts's pattern doesn't already cover: the deterministic
// status-machine transitions (active -> applied/dismissed -> active), the
// real Transaction row apply creates and undo deletes, and the 400/404
// error paths. Task 8 wired apply/dismiss/undo to
// updateFinancialIntelligencePipeline, which writes real
// intelligence:*:<portfolioId> Redis keys for every portfolio in the test
// DB (900s TTL) — cleaned up in afterAll below so they don't outlive this
// test's deleted portfolio row.

const redis = new Redis(process.env.REDIS_URL!);

let server: Server;
let baseUrl: string;

const portfolioId = uuidv4();
const assetId = uuidv4();
const symbol = "TASK5TEST";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/recommendation", recommendationRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1/recommendation`;

  const now = new Date();
  await testPrisma.portfolio.create({ data: { id: portfolioId, name: "Task 5 Test Portfolio", createdAt: now, updatedAt: now } });
  await testPrisma.asset.create({
    data: { id: assetId, symbol, name: "Task 5 Test Asset", assetClass: "equity", createdAt: now, updatedAt: now },
  });
  await testPrisma.assetSnapshot.create({ data: { assetId, createdAt: now, updatedAt: now } });
  await testPrisma.latestQuote.create({
    data: { symbol, assetId, price: 42.5, createdAt: now, updatedAt: now },
  });
  // Held asset: a real Position row is what makes heldAssetIds() (Task 8's
  // held-asset filter, matching Python's RecommendationRepository.
  // _held_asset_ids/get_all()) include this asset's recommendations.
  await testPrisma.position.create({
    data: {
      id: uuidv4(),
      portfolioId,
      symbol,
      assetId,
      quantity: 10,
      avgBuyPrice: 40.0,
      wallet: "spot",
      createdAt: now,
      updatedAt: now,
    },
  });
});

afterAll(async () => {
  await testPrisma.transaction.deleteMany({ where: { portfolioId } });
  await testPrisma.recommendation_outcomes.deleteMany({ where: { recommendations: { asset_id: assetId } } });
  await testPrisma.recommendation_explanations.deleteMany({ where: { recommendations: { asset_id: assetId } } });
  await testPrisma.recommendations.deleteMany({ where: { asset_id: assetId } });
  await testPrisma.latestQuote.deleteMany({ where: { symbol } });
  await testPrisma.assetSnapshot.deleteMany({ where: { assetId } });
  await testPrisma.position.deleteMany({ where: { portfolioId } });
  await testPrisma.asset.deleteMany({ where: { id: assetId } });
  await testPrisma.portfolio.deleteMany({ where: { id: portfolioId } });
  await redis.del(
    `intelligence:portfolio:${portfolioId}`,
    `intelligence:health:${portfolioId}`,
    `intelligence:recommendations:${portfolioId}`,
    `intelligence:outcomes:${portfolioId}`,
    `intelligence:dashboard:${portfolioId}`,
  );
  await redis.quit();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

let recId: string;

beforeEach(async () => {
  recId = uuidv4();
  const now = new Date();
  await testPrisma.recommendations.create({
    data: {
      id: recId,
      asset_id: assetId,
      recommendation_state: "BUY",
      confidence_score: 0.8,
      status: "active",
      version: "v2.0.0",
      created_at: now,
      updated_at: now,
    },
  });
});

afterEach(async () => {
  await testPrisma.transaction.deleteMany({ where: { recommendationId: recId } });
  await testPrisma.recommendation_outcomes.deleteMany({ where: { recommendation_id: recId } });
  await testPrisma.recommendation_explanations.deleteMany({ where: { recommendation_id: recId } });
  await testPrisma.recommendations.deleteMany({ where: { id: recId } });
});

describe("POST /recommendations/:id/apply", () => {
  it("creates a real BUY transaction, marks the recommendation applied, and records predicted_impact", async () => {
    const res = await fetch(`${baseUrl}/recommendations/${recId}/apply`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; outcome: { ledger_transaction_id: string; predicted_impact: number } };
    expect(body.status).toBe("applied");
    expect(body.outcome.predicted_impact).toBe(0.05);

    const txn = await testPrisma.transaction.findUnique({ where: { id: body.outcome.ledger_transaction_id } });
    expect(txn).not.toBeNull();
    expect(txn?.transactionType).toBe("BUY");
    expect(Number(txn?.quantity)).toBe(1);
    expect(Number(txn?.price)).toBe(42.5);
    expect(txn?.recommendationId).toBe(recId);

    const audit = await testPrisma.auditLog.findFirst({ where: { entityId: recId, action: "recommendation_apply" } });
    expect(audit).not.toBeNull();
  });

  it("rejects applying an already-applied recommendation with 400", async () => {
    await fetch(`${baseUrl}/recommendations/${recId}/apply`, { method: "POST" });
    const res = await fetch(`${baseUrl}/recommendations/${recId}/apply`, { method: "POST" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toBe("Recommendation is already applied");
  });

  it("404s for an unknown recommendation id", async () => {
    const res = await fetch(`${baseUrl}/recommendations/${uuidv4()}/apply`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("uses an explicit ?portfolio_id when given", async () => {
    const res = await fetch(`${baseUrl}/recommendations/${recId}/apply?portfolio_id=${portfolioId}`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { outcome: { ledger_transaction_id: string } };
    const txn = await testPrisma.transaction.findUnique({ where: { id: body.outcome.ledger_transaction_id } });
    expect(txn?.portfolioId).toBe(portfolioId);
  });
});

describe("POST /recommendations/:id/dismiss", () => {
  it("dismisses an active recommendation with a reason", async () => {
    const res = await fetch(`${baseUrl}/recommendations/${recId}/dismiss?reason=too_risky`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; outcome: { dismiss_reason: string } };
    expect(body.status).toBe("dismissed");
    expect(body.outcome.dismiss_reason).toBe("too_risky");
  });

  it("rejects dismissing a non-active recommendation with 400", async () => {
    await fetch(`${baseUrl}/recommendations/${recId}/dismiss`, { method: "POST" });
    const res = await fetch(`${baseUrl}/recommendations/${recId}/dismiss`, { method: "POST" });
    expect(res.status).toBe(400);
  });
});

describe("POST /recommendations/:id/undo", () => {
  it("rejects undoing an already-active recommendation with 400", async () => {
    const res = await fetch(`${baseUrl}/recommendations/${recId}/undo`, { method: "POST" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toBe("Recommendation is already active");
  });

  it("reverses apply: deletes the transaction and restores active status with a clean outcome", async () => {
    const applyRes = await fetch(`${baseUrl}/recommendations/${recId}/apply`, { method: "POST" });
    const applyBody = (await applyRes.json()) as { outcome: { ledger_transaction_id: string } };
    const txnId = applyBody.outcome.ledger_transaction_id;

    const undoRes = await fetch(`${baseUrl}/recommendations/${recId}/undo`, { method: "POST" });
    expect(undoRes.status).toBe(200);
    const undoBody = (await undoRes.json()) as {
      status: string;
      outcome: { status: string; ledger_transaction_id: string | null; predicted_impact: number | null };
    };
    expect(undoBody.status).toBe("active");
    expect(undoBody.outcome.ledger_transaction_id).toBeNull();

    const txn = await testPrisma.transaction.findUnique({ where: { id: txnId } });
    expect(txn).toBeNull();

    // Matches Python's own quirk (recommendation.py's undo_recommendation
    // logs rec.status *after* mutating it to "active"): the audit log's
    // "previous_status" is always "active", not the real prior status.
    // TODO(parity): this pins Python's undo_recommendation bug (audit log
    // always records previous_status="active", never the real prior
    // status) — see recommendation.py's undo_recommendation. If that bug is
    // ever fixed in either codebase, update this assertion to match.
    const audit = await testPrisma.auditLog.findFirst({
      where: { entityId: recId, action: "recommendation_undo" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.details).toEqual({ previous_status: "active" });
  });

  it("reverses dismiss: restores active status", async () => {
    await fetch(`${baseUrl}/recommendations/${recId}/dismiss?reason=x`, { method: "POST" });
    const res = await fetch(`${baseUrl}/recommendations/${recId}/undo`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; outcome: { dismiss_reason: string | null } };
    expect(body.status).toBe("active");
    expect(body.outcome.dismiss_reason).toBeNull();
  });

  it("404s for an unknown recommendation id", async () => {
    const res = await fetch(`${baseUrl}/recommendations/${uuidv4()}/undo`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});

// Task 8 review fix: GET /recommendations and the pipeline's
// intelligence:recommendations:<portfolioId> cache write must both filter
// to held-asset recommendations only (RecommendationRepository.get_all()/
// _held_asset_ids in Python), not every Recommendation row.
describe("held-asset filter (Task 8)", () => {
  const unheldAssetId = uuidv4();
  const unheldSymbol = "TASK8UNHELD";
  let unheldRecId: string;

  beforeEach(async () => {
    const now = new Date();
    await testPrisma.asset.create({
      data: { id: unheldAssetId, symbol: unheldSymbol, name: "Task 8 Unheld Asset", assetClass: "equity", createdAt: now, updatedAt: now },
    });
    // recommendations.asset_id FKs to asset_snapshot.asset_id, not assets.id.
    await testPrisma.assetSnapshot.create({ data: { assetId: unheldAssetId, createdAt: now, updatedAt: now } });
    unheldRecId = uuidv4();
    await testPrisma.recommendations.create({
      data: {
        id: unheldRecId,
        asset_id: unheldAssetId,
        recommendation_state: "BUY",
        confidence_score: 0.8,
        status: "active",
        version: "v2.0.0",
        created_at: now,
        updated_at: now,
      },
    });
  });

  afterEach(async () => {
    await testPrisma.recommendation_outcomes.deleteMany({ where: { recommendation_id: unheldRecId } });
    await testPrisma.recommendation_explanations.deleteMany({ where: { recommendation_id: unheldRecId } });
    await testPrisma.recommendations.deleteMany({ where: { id: unheldRecId } });
    await testPrisma.assetSnapshot.deleteMany({ where: { assetId: unheldAssetId } });
    await testPrisma.asset.deleteMany({ where: { id: unheldAssetId } });
  });

  it("GET /recommendations excludes recommendations for assets with no Position row", async () => {
    const res = await fetch(`${baseUrl}/recommendations`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string }>;
    const ids = body.map((r) => r.id);
    expect(ids).toContain(recId); // held (Position seeded in beforeAll)
    expect(ids).not.toContain(unheldRecId); // not held — no Position row
  });

  it("the pipeline's intelligence:recommendations cache excludes unheld assets after an apply", async () => {
    const res = await fetch(`${baseUrl}/recommendations/${recId}/apply?portfolio_id=${portfolioId}`, { method: "POST" });
    expect(res.status).toBe(200);

    const cached = await redis.get(`intelligence:recommendations:${portfolioId}`);
    expect(cached).not.toBeNull();
    const cachedRecs = JSON.parse(cached!) as Array<{ id: string }>;
    const ids = cachedRecs.map((r) => r.id);
    expect(ids).toContain(recId);
    expect(ids).not.toContain(unheldRecId);
  });
});

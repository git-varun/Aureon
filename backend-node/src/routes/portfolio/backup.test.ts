import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "http";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { backupRouter, parseBackupDate } from "./backup";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/portfolio", backupRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1/portfolio`;
});

afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

beforeEach(async () => {
  await testPrisma.transaction.deleteMany();
  await testPrisma.portfolio.deleteMany();
});

describe("GET /portfolio/backup", () => {
  it("includes every portfolio with its transactions, and returns a backup receipt header", async () => {
    const p1 = await testPrisma.portfolio.create({ data: { id: uuidv4(), name: "P1", createdAt: new Date(), updatedAt: new Date() } });
    await testPrisma.portfolio.create({ data: { id: uuidv4(), name: "P2", createdAt: new Date(), updatedAt: new Date() } });
    await testPrisma.transaction.create({
      data: { id: uuidv4(), portfolioId: p1.id, symbol: "AAPL", transactionType: "BUY", quantity: 1, price: 100, transactionDate: new Date(), fees: 0, taxes: 0, kind: "trade", createdAt: new Date(), updatedAt: new Date() },
    });

    const res = await fetch(`${baseUrl}/backup`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-backup-receipt")).toBeTruthy();
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename=aureon_backup_\d{8}\.json/);

    const body = (await res.json()) as {
      version: string;
      portfolios: { name: string; transactions: { symbol: string; type: string }[] }[];
    };
    expect(body.version).toBe("3.0.0");
    const names = body.portfolios.map((p) => p.name).sort();
    expect(names).toEqual(["P1", "P2"]);
    const p1Backup = body.portfolios.find((p) => p.name === "P1")!;
    expect(p1Backup.transactions).toHaveLength(1);
    expect(p1Backup.transactions[0].symbol).toBe("AAPL");
    expect(p1Backup.transactions[0].type).toBe("BUY"); // field is "type" not "transaction_type", matches Python
  });
});

describe("parseBackupDate", () => {
  // Python's export writes OFFSET-LESS ISO strings (its columns are naive
  // Timestamp(6)). Bare `new Date(s)` reads those as LOCAL time. This suite
  // forces a non-UTC process TZ so a regression is actually observable — on a
  // UTC host the buggy and correct parses are indistinguishable.
  const originalTz = process.env.TZ;
  beforeAll(() => { process.env.TZ = "Asia/Kolkata"; });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("treats an offset-less timestamp as UTC, not local time", () => {
    // Guard: if the runtime didn't pick up the TZ change this test has no
    // teeth and would pass vacuously — fail loudly instead of pretending.
    expect(new Date("2026-08-08T16:13:44.123").getTime()).not.toBe(Date.UTC(2026, 7, 8, 16, 13, 44, 123));
    expect(parseBackupDate("2026-08-08T16:13:44.123456").getTime()).toBe(Date.UTC(2026, 7, 8, 16, 13, 44, 123));
  });

  it("respects an explicit Z or numeric offset", () => {
    expect(parseBackupDate("2026-08-08T16:13:44.123Z").getTime()).toBe(Date.UTC(2026, 7, 8, 16, 13, 44, 123));
    expect(parseBackupDate("2026-08-08T16:13:44.123+05:30").getTime()).toBe(Date.UTC(2026, 7, 8, 10, 43, 44, 123));
  });

  it("passes a date-only string through unchanged (already UTC per spec)", () => {
    expect(parseBackupDate("2026-08-08").getTime()).toBe(Date.UTC(2026, 7, 8));
  });
});

describe("POST /portfolio/restore", () => {
  function backupFile(overrides: Record<string, unknown> = {}) {
    const backup = {
      version: "3.0.0", exported_at: new Date().toISOString(), user_id: "x",
      portfolios: [{ name: "RestoreTest", transactions: [
        { symbol: "AAPL", type: "BUY", qty: 10, price: 100, date: new Date().toISOString(), fees: 0, taxes: 0, kind: "trade" },
      ] }],
      watchlists: [], ai_generations: [], ai_evaluations: [], ai_feedback: [], ai_briefings: [],
      recommendations: [], recommendation_explanations: [], recommendation_outcomes: [],
      market_themes: [], theme_weights: [],
      ...overrides,
    };
    return new Blob([JSON.stringify(backup)], { type: "application/json" });
  }

  it("confirm=false is a dry run — no writes", async () => {
    // getCurrentUser runs before the confirm branch (exact parity with
    // Python's Depends ordering) and can create the singleton User row, so
    // warm it first — it must not be a variable in the no-writes assertion.
    await fetch(`${baseUrl}/backup`);

    const form = new FormData();
    form.append("file", backupFile(), "backup.json");
    const res = await fetch(`${baseUrl}/restore?confirm=false`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; transactions_count: number; portfolios_count: number };
    expect(body.status).toBe("dry_run");
    expect(body.transactions_count).toBe(1);
    expect(body.portfolios_count).toBe(1);
    expect(await testPrisma.portfolio.findFirst({ where: { name: "RestoreTest" } })).toBeNull();
    expect(await testPrisma.transaction.count()).toBe(0);
  });

  it("confirm=true restores, and applies cost basis / recalculates positions", async () => {
    const form = new FormData();
    form.append("file", backupFile(), "backup.json");
    const res = await fetch(`${baseUrl}/restore?confirm=true`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; imported_transactions: number; imported_portfolios: number };
    expect(body.status).toBe("success");
    expect(body.imported_transactions).toBe(1);
    expect(body.imported_portfolios).toBe(1);

    const portfolio = await testPrisma.portfolio.findFirst({ where: { name: "RestoreTest" } });
    expect(portfolio).not.toBeNull();
    const pos = await testPrisma.position.findFirst({ where: { portfolioId: portfolio!.id, symbol: "AAPL" } });
    expect(Number(pos!.quantity)).toBe(10);
    expect(Number(pos!.avgBuyPrice)).toBe(100);
  });

  it("restores an offset-less (Python-exported) timestamp as the same UTC instant", async () => {
    const form = new FormData();
    form.append("file", backupFile({
      portfolios: [{ name: "RestoreTest", transactions: [
        // Exactly the shape Python's naive Timestamp(6) export produces: no Z,
        // no numeric offset. Must land on 16:13:44 UTC, not shifted by the
        // host's offset.
        { symbol: "AAPL", type: "BUY", qty: 10, price: 100, date: "2026-08-08T16:13:44.123456", fees: 0, taxes: 0, kind: "trade" },
      ] }],
    }), "backup.json");
    const res = await fetch(`${baseUrl}/restore?confirm=true`, { method: "POST", body: form });
    expect(res.status).toBe(200);

    const portfolio = await testPrisma.portfolio.findFirst({ where: { name: "RestoreTest" } });
    const txn = await testPrisma.transaction.findFirst({ where: { portfolioId: portfolio!.id } });
    expect(txn!.transactionDate.getTime()).toBe(Date.UTC(2026, 7, 8, 16, 13, 44, 123));
  });

  it("wipes ALL five per-portfolio entities, not just positions and transactions", async () => {
    // Position/Transaction deletion is already covered by the restore and
    // rollback cases. The other three destructive deletes each use a
    // different scoping field name (`portfolio_id`, not `portfolioId`) and
    // would silently no-op if mis-scoped — seed one row of each so a
    // regression there actually fails something.
    const p = await testPrisma.portfolio.create({
      data: { id: uuidv4(), name: "RestoreTest", createdAt: new Date(), updatedAt: new Date() },
    });
    await testPrisma.snapshots.create({
      data: { portfolio_id: p.id, market_value: 1000, cash_balance: 50, created_at: new Date(), updated_at: new Date() },
    });
    await testPrisma.import_runs.create({
      data: {
        id: uuidv4(), portfolio_id: p.id, source: "csv", filename: "old.csv", status: "SUCCESS",
        rows_committed: 3, rows_skipped: 0, started_at: new Date(), duration_ms: 12,
        created_at: new Date(), updated_at: new Date(),
      },
    });
    await testPrisma.binance_backfill_progress.create({
      data: {
        id: uuidv4(), portfolio_id: p.id, symbol: "BTC", trades_fetched: 10, trades_imported: 10,
        done: true, created_at: new Date(), updated_at: new Date(),
      },
    });

    const form = new FormData();
    form.append("file", backupFile(), "backup.json"); // targets "RestoreTest" by name
    const res = await fetch(`${baseUrl}/restore?confirm=true`, { method: "POST", body: form });
    expect(res.status).toBe(200);

    // Same portfolio row reused (never deleted/recreated), so these counts are
    // scoped to the id we seeded against.
    expect(await testPrisma.portfolio.count({ where: { name: "RestoreTest" } })).toBe(1);
    expect(await testPrisma.snapshots.count({ where: { portfolio_id: p.id } })).toBe(0);
    expect(await testPrisma.import_runs.count({ where: { portfolio_id: p.id } })).toBe(0);
    expect(await testPrisma.binance_backfill_progress.count({ where: { portfolio_id: p.id } })).toBe(0);
  });

  it("double-restore of the same file is idempotent — no duplication, no crash", async () => {
    const form1 = new FormData();
    form1.append("file", backupFile(), "backup.json");
    await fetch(`${baseUrl}/restore?confirm=true`, { method: "POST", body: form1 });

    const form2 = new FormData();
    form2.append("file", backupFile(), "backup.json");
    const res2 = await fetch(`${baseUrl}/restore?confirm=true`, { method: "POST", body: form2 });
    expect(res2.status).toBe(200);

    const portfolios = await testPrisma.portfolio.findMany({ where: { name: "RestoreTest" } });
    expect(portfolios).toHaveLength(1); // matched by name, not duplicated
    const txns = await testPrisma.transaction.findMany({ where: { portfolioId: portfolios[0].id } });
    expect(txns).toHaveLength(1); // old deleted, new inserted — not accumulated to 2
  });

  it("a mid-restore failure rolls back fully — no partial delete-without-replace", async () => {
    const p = await testPrisma.portfolio.create({ data: { id: uuidv4(), name: "RollbackTest", createdAt: new Date(), updatedAt: new Date() } });
    await testPrisma.transaction.create({
      data: { id: uuidv4(), portfolioId: p.id, symbol: "EXISTING", transactionType: "BUY", quantity: 1, price: 1, transactionDate: new Date(), fees: 0, taxes: 0, kind: "trade", createdAt: new Date(), updatedAt: new Date() },
    });

    const badBackup = backupFile({
      portfolios: [{ name: "RollbackTest", transactions: [
        // FK to a non-existent recommendation — violates
        // fk_transactions_recommendation_id on INSERT, which happens AFTER the
        // per-portfolio deletes have already run. That's the torn-state window.
        { symbol: "NEWSYM", type: "BUY", qty: 1, price: 1, date: new Date().toISOString(), fees: 0, taxes: 0, kind: "trade", recommendation_id: "00000000-0000-0000-0000-000000000000" },
      ] }],
    });
    const form = new FormData();
    form.append("file", badBackup, "backup.json");
    // The console.error stack from errorHandler's 500 fallback (Prisma P2003
    // matches none of its typed branches) is expected noise here.
    const res = await fetch(`${baseUrl}/restore?confirm=true`, { method: "POST", body: form });
    expect(res.status).toBeGreaterThanOrEqual(400);

    // Pre-restore state must be fully intact — not deleted-without-replace,
    // and not partially replaced either.
    const stillThere = await testPrisma.transaction.findFirst({ where: { portfolioId: p.id, symbol: "EXISTING" } });
    expect(stillThere).not.toBeNull();
    expect(await testPrisma.transaction.count({ where: { portfolioId: p.id } })).toBe(1);
    expect(await testPrisma.transaction.findFirst({ where: { symbol: "NEWSYM" } })).toBeNull();
  });
});

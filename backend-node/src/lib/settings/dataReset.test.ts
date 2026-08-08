import { describe, it, expect, beforeEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { previewReset, runReset, SCOPES } from "./dataReset";
import { storeBackupReceipt, consumeBackupReceipt } from "./resetRedis";

const OWNER_ID = "00000000-0000-0000-0000-000000000000";

beforeEach(async () => {
  await testPrisma.watchlistSymbol.deleteMany();
  await testPrisma.watchlists.deleteMany();
  await testPrisma.theme_weights.deleteMany();
  await testPrisma.market_themes.deleteMany();
});

describe("DataResetService", () => {
  it("SCOPES is exactly the 5 documented scopes", () => {
    expect(SCOPES).toEqual(["portfolio", "watchlists", "ai_history", "recommendation_history", "custom_themes"]);
  });

  it("preview and reset report identical counts for custom_themes (no drift)", async () => {
    await testPrisma.user.upsert({ where: { id: OWNER_ID }, create: { id: OWNER_ID, email: "local@aureon.app", isActive: true, createdAt: new Date(), updatedAt: new Date() }, update: {} });
    const themeId = uuidv4().slice(0, 28); // theme_id column is VarChar(40); "custom-" prefix is 7 chars
    await testPrisma.market_themes.create({
      data: { id: uuidv4(), theme_id: `custom-${themeId}`, name: "Test Theme", desc: "d", symbols: ["AAPL"], ret1m: 0, owner_id: OWNER_ID, is_public: false, created_at: new Date(), updated_at: new Date() },
    });
    await testPrisma.theme_weights.createMany({
      data: [{ id: uuidv4(), theme_id: `custom-${themeId}`, symbol: "AAPL", weight: 1, effective_date: "2024-01-01", created_at: new Date() }],
    });

    const preview = await previewReset(["custom_themes"], OWNER_ID);
    expect(preview.custom_themes).toEqual({ custom_themes: 1, theme_weights: 1 });

    const result = await runReset(["custom_themes"], OWNER_ID, OWNER_ID);
    expect(result.custom_themes).toEqual({ custom_themes_cleared: 1, theme_weights_cleared: 1 });

    expect(await testPrisma.market_themes.count({ where: { owner_id: OWNER_ID } })).toBe(0);
    expect(await testPrisma.theme_weights.count()).toBe(0);
  });

  it("rejects an unknown scope", async () => {
    await expect(previewReset(["not_a_scope"], OWNER_ID)).rejects.toThrow();
  });

  it("a failure at the very end of the transaction (audit log write) rolls back every scope delete already performed, not just the failing statement", async () => {
    // The brief's originally proposed trigger — a Transaction referenced by
    // recommendation_outcomes.ledger_transaction_id blocking its own
    // cascade-delete — does NOT reproduce: live pg_constraint inspection
    // shows fk_recommendation_outcomes_ledger_transaction_id has
    // confdeltype='n', and per Postgres's pg_constraint docs 'n' means
    // ON DELETE SET NULL, not NO ACTION ('a' is NO ACTION). Verified live:
    // deleting the referenced portfolio/transaction inside a transaction
    // block just SET NULLs ledger_transaction_id and succeeds — no FK
    // violation is raised. A full scan of pg_constraint for confdeltype in
    // ('a','r') (NO ACTION / RESTRICT) turned up exactly one such
    // constraint in the whole schema (fk_asset_sentiment_snapshots_asset_id,
    // news.asset_sentiment_snapshots -> market.assets), which is unrelated
    // to any reset scope — there is no live NO-ACTION/RESTRICT FK on the
    // delete path of any of the 5 scopes to exploit as a rollback trigger.
    //
    // Real, verified-live substitute trigger: runReset's final statement in
    // the shared transaction is logAuditAction's INSERT into
    // system.audit_logs, whose actor_id column has a real (non-deferrable)
    // FK to system.users (fk_audit_logs_actor_id). Passing an actorId that
    // is not a real user row causes Postgres to reject that INSERT with a
    // genuine foreign key violation — confirmed live via psql:
    //   ERROR:  insert or update on table "audit_logs" violates foreign key
    //   constraint "fk_audit_logs_actor_id"
    //   DETAIL:  Key (actor_id)=(ffffffff-ffff-ffff-ffff-ffffffffffff) is
    //   not present in table "users".
    // This is arguably a more direct test of the exact fix under review
    // here (Task 6 header note: the corrected draft wraps ALL FIVE scope
    // calls PLUS the final logAuditAction call in one transaction) — it
    // proves that even a failure in the very last statement rolls back
    // every portfolio delete that already succeeded earlier in the call.
    const p1 = await testPrisma.portfolio.create({ data: { id: uuidv4(), name: "rollback-p1", createdAt: new Date(), updatedAt: new Date() } });
    const p2 = await testPrisma.portfolio.create({ data: { id: uuidv4(), name: "rollback-p2", createdAt: new Date(), updatedAt: new Date() } });
    const nonExistentActorId = "ffffffff-ffff-ffff-ffff-ffffffffffff";

    await expect(runReset(["portfolio"], OWNER_ID, nonExistentActorId)).rejects.toThrow();

    // Both portfolios must survive — proof the whole scope's partial work
    // (both deletes, which would have succeeded on their own) rolled back
    // too, because the transaction's final statement (the audit log write)
    // failed.
    expect(await testPrisma.portfolio.findUnique({ where: { id: p1.id } })).not.toBeNull();
    expect(await testPrisma.portfolio.findUnique({ where: { id: p2.id } })).not.toBeNull();

    // Cleanup for subsequent tests in this file.
    await testPrisma.portfolio.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
  });

  it("backup receipt is single-use", async () => {
    await storeBackupReceipt("receipt-abc");
    expect(await consumeBackupReceipt("receipt-abc")).toBe(true);
    expect(await consumeBackupReceipt("receipt-abc")).toBe(false); // already consumed
  });
});

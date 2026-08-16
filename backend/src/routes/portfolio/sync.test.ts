import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { syncRouter } from "./sync";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/portfolio", syncRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1/portfolio`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("POST /portfolio/sync", () => {
  it("rejects a disabled job (sync_zerodha is seeded enabled=false, matching PROVIDERS.md's documented state) with 409", async () => {
    const job = await testPrisma.jobConfig.findUnique({ where: { jobName: "sync_zerodha" } });
    expect(job?.enabled).toBe(false); // sanity-check the seed assumption this test relies on

    const res = await fetch(`${baseUrl}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ broker: "zerodha" }),
    });
    expect(res.status).toBe(409);
  });

  it(
    "end-to-end: enabling sync_zerodha and dispatching with no credentials configured produces a FAILED job log " +
      "with an AUTH_REQUIRED message — the real failure path a credential-less dev environment exercises " +
      "(no live Zerodha credentials were used or required for this assertion)",
    async () => {
      await testPrisma.jobConfig.updateMany({ where: { jobName: "sync_zerodha" }, data: { enabled: true } });
      try {
        const res = await fetch(`${baseUrl}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ broker: "zerodha" }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { status: string; task_id: string };
        expect(body.status).toBe("queued");

        // The runner is fire-and-forget (dispatchJob doesn't await it) — poll
        // briefly for the JobLog to close out.
        let log = null;
        for (let i = 0; i < 20; i++) {
          log = await testPrisma.jobLog.findFirst({ where: { taskId: body.task_id } });
          if (log && log.status !== "RUNNING") break;
          await sleep(100);
        }
        expect(log?.status).toBe("FAILED");
        expect(log?.errorMessage ?? "").toContain("AUTH_REQUIRED");
      } finally {
        await testPrisma.jobConfig.updateMany({ where: { jobName: "sync_zerodha" }, data: { enabled: false } });
      }
    },
    10_000,
  );
});

describe("GET /portfolio/sync/status", () => {
  it("reports auth_required for a syncable broker with no credentials configured", async () => {
    const res = await fetch(`${baseUrl}/sync/status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ provider: string; status: string; positions_count: number }>;
    const zerodha = body.find((r) => r.provider === "zerodha");
    expect(zerodha).toBeTruthy();
    // access_token is the required key and this test DB has no credentials
    // configured for any broker (encrypted_keys = "{}"), matching the real
    // dev environment's state at the time of this audit.
    expect(zerodha!.status).toBe("auth_required");
  });
});

describe("POST /portfolio/portfolios/:id/sync/binance/backfill", () => {
  it("404s for a nonexistent portfolio", async () => {
    const res = await fetch(`${baseUrl}/portfolios/${uuidv4()}/sync/binance/backfill`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("dispatches for a real portfolio and the runner fails cleanly with AUTH_REQUIRED (no Binance credentials configured)", async () => {
    const portfolio = await testPrisma.portfolio.create({
      data: { id: uuidv4(), name: `vitest-backfill-${uuidv4()}`, isArchived: false, createdAt: new Date(), updatedAt: new Date() },
    });
    try {
      const res = await fetch(`${baseUrl}/portfolios/${portfolio.id}/sync/binance/backfill`, { method: "POST" });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; task_id: string; scope: string };
      expect(body.status).toBe("queued");
      expect(body.scope).toBe("spot_only");

      let log = null;
      for (let i = 0; i < 20; i++) {
        log = await testPrisma.jobLog.findFirst({ where: { taskId: body.task_id } });
        if (log && log.status !== "RUNNING") break;
        await sleep(100);
      }
      expect(log?.status).toBe("FAILED");
      expect(log?.errorMessage ?? "").toContain("AUTH_REQUIRED");
    } finally {
      await testPrisma.portfolio.delete({ where: { id: portfolio.id } });
    }
  }, 10_000);

  it("GET backfill/status 404s for a nonexistent portfolio", async () => {
    const res = await fetch(`${baseUrl}/portfolios/${uuidv4()}/sync/binance/backfill/status`);
    expect(res.status).toBe(404);
  });
});

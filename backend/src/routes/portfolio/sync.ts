import { Router } from "express";
import { prisma } from "../../prisma";
import { dispatchJob, dispatchPortfolioJob } from "../../lib/settings/jobDispatch";
import { getAllProviders } from "../../lib/settings/providers";
import { getJobLogs, getLastSuccessfulRun } from "../../lib/jobs/config";
import { countBrokerPositions, getBinanceBackfillStatus } from "../../lib/broker/brokerSync";
import { NotFoundError } from "../../lib/errors";

export const syncRouter = Router();

// Port of PortfolioService.sync_brokers (POST /sync). broker -> job_name,
// same fallback-to-"sync_portfolio" mapping as Python. UNLIKE Python,
// sync_portfolio has no Node runner (see jobDispatch.ts's JOB_RUNNERS — it
// isn't in scope for Task 4's broker-sync port), so that fallback branch
// throws a ConfigurationError here instead of actually dispatching a
// portfolio-wide snapshot refresh the way Python's real sync_portfolio_task
// does. This is a REAL functional gap, not parity: the plain "Sync" button
// (no broker selected) would 400 on this route today. Must be closed before
// this route can be cut over in vite.config.js, independent of the
// broker-credential blockers documented in task4-report.md.
syncRouter.post("/sync", async (req, res) => {
  const broker = String(req.body?.broker ?? "").toLowerCase();
  const jobName = ({ zerodha: "sync_zerodha", binance: "sync_binance", groww: "sync_groww" } as Record<string, string>)[broker] ?? "sync_portfolio";
  const taskId = await dispatchJob(jobName);
  res.json({ status: "queued", message: `${broker || "portfolio"} sync queued`, task_id: taskId });
});

// provider_name -> (job_name, keys required to consider it "connected")
const SYNCABLE_BROKERS: Record<string, { jobName: string; requiredKeys: string[] }> = {
  zerodha: { jobName: "sync_zerodha", requiredKeys: ["access_token"] },
  binance: { jobName: "sync_binance", requiredKeys: ["api_key", "api_secret"] },
  groww: { jobName: "sync_groww", requiredKeys: ["api_key", "api_secret"] },
};

// Port of PortfolioService.get_sync_status (GET /sync/status).
syncRouter.get("/sync/status", async (_req, res) => {
  const providers = (await getAllProviders()).filter((p) => p.provider_type === "broker");

  const results = [];
  for (const provider of providers) {
    const name = provider.provider_name;
    const syncable = SYNCABLE_BROKERS[name];
    if (!syncable) continue; // no sync implementation yet for this broker

    const { jobName, requiredKeys } = syncable;
    const hasToken = requiredKeys.every((k) => Boolean((provider.keys_status as Record<string, boolean>)[k]));
    const logs = await getJobLogs(jobName, 1, 0);
    const lastLog = logs[0] ?? null;
    const lastSuccess = await getLastSuccessfulRun(jobName);

    let status: string;
    let error: string | null;
    if (!hasToken) {
      status = "auth_required";
      error = null;
    } else if (lastLog && lastLog.status === "FAILED" && (lastLog.errorMessage ?? "").includes("AUTH_REQUIRED")) {
      status = "auth_required";
      error = lastLog.errorMessage;
    } else if (lastLog && lastLog.status === "FAILED") {
      status = "error";
      error = lastLog.errorMessage;
    } else if (lastLog && lastLog.status === "SUCCESS") {
      status = "ok";
      error = null;
    } else {
      status = "idle";
      error = null;
    }

    const positionsCount = await countBrokerPositions(name);

    results.push({
      provider: name,
      status,
      // last time this job actually succeeded, regardless of whether a later
      // attempt failed — a FAILED-most-recent run must not mask a real
      // recent success (see getLastSuccessfulRun docstring).
      last_synced_at: lastSuccess ? lastSuccess.ended_at : null,
      positions_count: positionsCount,
      error,
    });
  }

  res.json(results);
});

// Port of PortfolioService.backfill_binance_spot's route
// (POST /portfolios/{id}/sync/binance/backfill). One-time, user-triggered
// full-history Spot trade backfill — not part of regular sync cadence.
// Resumable: an interrupted run continues from its per-symbol checkpoint on
// the next call. Spot only.
syncRouter.post("/portfolios/:id/sync/binance/backfill", async (req, res) => {
  const portfolio = await prisma.portfolio.findUnique({ where: { id: req.params.id } });
  if (!portfolio) throw new NotFoundError("Portfolio not found");

  const taskId = await dispatchPortfolioJob("backfill_binance_spot", req.params.id);
  res.json({
    status: "queued",
    task_id: taskId,
    scope: "spot_only",
    message:
      "Binance Spot trade-history backfill queued — walks full account history via fromId pagination, resumable if interrupted. Spot only: Futures trade history is not backfilled (Binance API limitation). Poll GET /portfolios/{id}/sync/binance/backfill/status for progress.",
  });
});

syncRouter.get("/portfolios/:id/sync/binance/backfill/status", async (req, res) => {
  const portfolio = await prisma.portfolio.findUnique({ where: { id: req.params.id } });
  if (!portfolio) throw new NotFoundError("Portfolio not found");

  res.json(await getBinanceBackfillStatus(req.params.id));
});

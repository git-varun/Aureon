import { Router } from "express";
import { requireUuidParam } from "../../lib/validation";
import {
  getAssetHealth,
  getProviderHealth,
  getFailedIngestions,
  getDependenciesStatus,
  getAggregateHealth,
  checkTransactionIntegrity,
  checkPositionQuoteIntegrity,
  getObservability,
} from "../../lib/monitoring/monitoring";

// Port of app/api/v1/monitoring.py — mounted at /api/v1/monitoring (matches
// Python's app-level prefix). get_provider_health/get_aggregate_health only
// carry the quote-provider half (see monitoring.ts's getProviderHealth doc
// comment) and get_observability omits the error-fingerprint source (see its
// doc comment) — everything else is a full, direct port.
export const monitoringRouter = Router();

monitoringRouter.get("/assets/:assetId/health", async (req, res, next) => {
  try {
    requireUuidParam(req.params.assetId, "assetId");
    res.json(await getAssetHealth(req.params.assetId));
  } catch (e) {
    next(e);
  }
});

monitoringRouter.get("/providers", async (_req, res, next) => {
  try {
    res.json(await getProviderHealth());
  } catch (e) {
    next(e);
  }
});

monitoringRouter.get("/failed-ingestions", async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    res.json(await getFailedIngestions(limit, offset));
  } catch (e) {
    next(e);
  }
});

monitoringRouter.get("/dependencies", async (_req, res, next) => {
  try {
    res.json(await getDependenciesStatus());
  } catch (e) {
    next(e);
  }
});

monitoringRouter.get("/health/aggregate", async (_req, res, next) => {
  try {
    res.json(await getAggregateHealth());
  } catch (e) {
    next(e);
  }
});

monitoringRouter.get("/transactions/integrity", async (_req, res, next) => {
  try {
    res.json(await checkTransactionIntegrity());
  } catch (e) {
    next(e);
  }
});

monitoringRouter.get("/positions/quote-integrity", async (_req, res, next) => {
  try {
    res.json(await checkPositionQuoteIntegrity());
  } catch (e) {
    next(e);
  }
});

monitoringRouter.get("/observability", async (req, res, next) => {
  try {
    const q = req.query;
    res.json(
      await getObservability({
        taskName: typeof q.task_name === "string" ? q.task_name : undefined,
        status: typeof q.status === "string" ? q.status : undefined,
        action: typeof q.action === "string" ? q.action : undefined,
        since: typeof q.since === "string" ? new Date(q.since) : undefined,
        until: typeof q.until === "string" ? new Date(q.until) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      }),
    );
  } catch (e) {
    if (e instanceof RangeError) {
      res.status(400).json({ detail: e.message });
      return;
    }
    next(e);
  }
});

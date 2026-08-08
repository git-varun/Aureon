import { Router } from "express";
import { getHealth, computeHealthScore } from "../../lib/monitoring/monitoring";

// Port of app/core/api/system/health.py — mounted at /api/v1 (matches
// Python's router with no own prefix + app-level "/api/v1").
export const systemHealthRouter = Router();

systemHealthRouter.get("/health", async (_req, res, next) => {
  try {
    res.json(await getHealth());
  } catch (e) {
    next(e);
  }
});

systemHealthRouter.get("/health/score", async (_req, res, next) => {
  try {
    res.json(await computeHealthScore());
  } catch (e) {
    next(e);
  }
});

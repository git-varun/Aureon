import { Router } from "express";
import { requireUuidParam } from "../../lib/validation";
import { getCurrentUser } from "../../lib/users";
import {
  getPortfolioDiversificationScore,
  getPortfolioConcentrationAnalysis,
  getCashDeploymentOpportunities,
  getRecommendationQualityMetrics,
  getRecommendationPerformance,
  getConfidenceCalibration,
  getInvestorHealthScore,
  getGoalProgressMetrics,
} from "../../lib/ai/intelligence";

// Port of app/modules/ai/api/intelligence.py — the analytics endpoints
// whose backing service methods are in scope for this phase (see the Phase
// 8 handoff). /dashboard, the trend endpoints, and the cache read/write
// wrapping are deliberately deferred — cache setters for these keys don't
// exist in Node yet (only invalidators, in lib/portfolioCache.ts).
export const intelligenceRouter = Router();

intelligenceRouter.get("/outcomes", async (req, res, next) => {
  try {
    const quality_metrics = await getRecommendationQualityMetrics();
    const performance = await getRecommendationPerformance();
    res.json({ quality_metrics, performance });
  } catch (e) {
    next(e);
  }
});

intelligenceRouter.get("/calibration", async (req, res, next) => {
  try {
    res.json(await getConfidenceCalibration());
  } catch (e) {
    next(e);
  }
});

intelligenceRouter.get("/portfolio-health", async (req, res, next) => {
  try {
    const portfolioId = String(req.query.portfolio_id ?? "");
    requireUuidParam(portfolioId, "portfolio_id");
    res.json(await getInvestorHealthScore(portfolioId));
  } catch (e) {
    next(e);
  }
});

intelligenceRouter.get("/diversification", async (req, res, next) => {
  try {
    const portfolioId = String(req.query.portfolio_id ?? "");
    requireUuidParam(portfolioId, "portfolio_id");
    res.json(await getPortfolioDiversificationScore(portfolioId));
  } catch (e) {
    next(e);
  }
});

intelligenceRouter.get("/concentration", async (req, res, next) => {
  try {
    const portfolioId = String(req.query.portfolio_id ?? "");
    requireUuidParam(portfolioId, "portfolio_id");
    res.json(await getPortfolioConcentrationAnalysis(portfolioId));
  } catch (e) {
    next(e);
  }
});

intelligenceRouter.get("/goals", async (req, res, next) => {
  try {
    const portfolioId = String(req.query.portfolio_id ?? "");
    requireUuidParam(portfolioId, "portfolio_id");
    const user = await getCurrentUser();
    res.json(await getGoalProgressMetrics(portfolioId, user.id));
  } catch (e) {
    next(e);
  }
});

intelligenceRouter.get("/cash-opportunities", async (req, res, next) => {
  try {
    const portfolioId = String(req.query.portfolio_id ?? "");
    requireUuidParam(portfolioId, "portfolio_id");
    res.json(await getCashDeploymentOpportunities(portfolioId));
  } catch (e) {
    next(e);
  }
});

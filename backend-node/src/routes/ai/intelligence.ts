import { Router } from "express";
import { requireUuidParam } from "../../lib/validation";
import { RequestValidationError } from "../../lib/errors";
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
  getPortfolioHealthTrend,
  getDiversificationTrend,
} from "../../lib/ai/intelligence";

// Port of app/modules/ai/api/intelligence.py — the analytics endpoints
// whose backing service methods are in scope for this phase (see the Phase
// 8 handoff). /dashboard and the cache read/write wrapping on the other
// endpoints below are deliberately still deferred (no live route needs them
// yet). The two trend endpoints (portfolio-health/trend, diversification/
// trend) were ported in migration plan Task 8 — see lib/ai/intelligence.ts.
export const intelligenceRouter = Router();

/** Same ge=1/le=1825 range as Python's `days: int = Query(30, ge=1, le=1825)`
 * and Node's existing precedent in routes/portfolio/positions.ts's /history. */
function parseDaysParam(raw: unknown): number {
  if (raw === undefined) return 30;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1825) {
    throw new RequestValidationError("days must be an integer between 1 and 1825");
  }
  return parsed;
}

intelligenceRouter.get("/portfolio-health/trend", async (req, res, next) => {
  try {
    const portfolioId = String(req.query.portfolio_id ?? "");
    requireUuidParam(portfolioId, "portfolio_id");
    const days = parseDaysParam(req.query.days);
    res.json(await getPortfolioHealthTrend(portfolioId, days));
  } catch (e) {
    next(e);
  }
});

intelligenceRouter.get("/diversification/trend", async (req, res, next) => {
  try {
    const portfolioId = String(req.query.portfolio_id ?? "");
    requireUuidParam(portfolioId, "portfolio_id");
    const days = parseDaysParam(req.query.days);
    res.json(await getDiversificationTrend(portfolioId, days));
  } catch (e) {
    next(e);
  }
});

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

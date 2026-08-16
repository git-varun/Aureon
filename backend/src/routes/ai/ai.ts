import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../../prisma";
import { getCurrentUser, getUserContext } from "../../lib/users";
import { requireUuidParam } from "../../lib/validation";
import { RequestValidationError } from "../../lib/errors";
import {
  generateBriefing,
  askAureon,
  explainRecommendation,
  submitFeedback,
  getBriefingHistory,
  getSingleAssetTake,
  getUsageSummary,
} from "../../lib/ai/aiService";
import { dispatchJob } from "../../lib/settings/jobDispatch";

// Port of app/modules/ai/api/ai.py — the briefing/Q&A/feedback/explain
// surface, briefing-history/single-asset-take/usage-summary analytics
// endpoints, and news-batch dispatch.
export const aiRouter = Router();

function parseOptionalDateQuery(value: unknown, paramName: string): Date | null {
  if (value === undefined) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new RequestValidationError(`${paramName} must be a valid ISO 8601 datetime`);
  }
  return d;
}

aiRouter.post("/ai/global", async (req, res, next) => {
  try {
    const user = await getCurrentUser();
    res.json(await generateBriefing("global", user.id));
  } catch (e) {
    next(e);
  }
});

aiRouter.post("/ai/weekly", async (req, res, next) => {
  try {
    const user = await getCurrentUser();
    res.json(await generateBriefing("weekly", user.id));
  } catch (e) {
    next(e);
  }
});

aiRouter.post("/ai/monthly", async (req, res, next) => {
  try {
    const user = await getCurrentUser();
    res.json(await generateBriefing("monthly", user.id));
  } catch (e) {
    next(e);
  }
});

aiRouter.post("/ai/qa", async (req, res, next) => {
  try {
    const { context_type: contextType, context_id: contextId, question } = req.body ?? {};
    if (typeof contextType !== "string" || typeof contextId !== "string" || typeof question !== "string") {
      throw new RequestValidationError("context_type, context_id, and question are required");
    }
    requireUuidParam(contextId, "context_id");
    const user = await getCurrentUser();
    const { response, generationId } = await askAureon(contextType, contextId, question, user.id);
    res.json({ response, generation_id: generationId });
  } catch (e) {
    next(e);
  }
});

aiRouter.post("/ai/feedback", async (req, res, next) => {
  try {
    const { generation_id: generationId, rating, comment } = req.body ?? {};
    requireUuidParam(generationId, "generation_id");
    const user = await getCurrentUser();
    const feedback = await submitFeedback(generationId, Number(rating), comment ?? null, user.id);
    res.json(feedback);
  } catch (e) {
    next(e);
  }
});

aiRouter.post("/ai/recommendations/:id/explain", async (req, res, next) => {
  try {
    requireUuidParam(req.params.id, "recommendation_id");
    const user = await getCurrentUser();
    res.json(await explainRecommendation(req.params.id, user.id));
  } catch (e) {
    next(e);
  }
});

aiRouter.get("/analytics/ai/briefings", async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 30;
    res.json(await getBriefingHistory(limit));
  } catch (e) {
    next(e);
  }
});

// Port of get_ai_take. get_user_context is a side-effect-only call in Python
// (ensures the default Portfolio exists; the returned id is unused here).
async function handleSingleAssetTake(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getCurrentUser();
    await prisma.$transaction((tx) => getUserContext(tx));
    res.json(await getSingleAssetTake(String(req.params.symbol), user.id));
  } catch (e) {
    next(e);
  }
}
aiRouter.get("/analytics/ai/single/:symbol", handleSingleAssetTake);
aiRouter.post("/analytics/ai/single/:symbol", handleSingleAssetTake);

aiRouter.get("/analytics/ai/usage", async (req, res, next) => {
  try {
    await getCurrentUser();
    await prisma.$transaction((tx) => getUserContext(tx));
    const since = parseOptionalDateQuery(req.query.since, "since");
    const until = parseOptionalDateQuery(req.query.until, "until");
    res.json(await getUsageSummary(since, until));
  } catch (e) {
    next(e);
  }
});

// Port of analyze_news_batch — pure job dispatch, no AI logic of its own.
aiRouter.post("/analytics/ai/news/batch", async (req, res, next) => {
  try {
    const taskId = await dispatchJob("fetch_news");
    res.json({ status: "queued", message: "News batch queued", task_id: taskId });
  } catch (e) {
    next(e);
  }
});

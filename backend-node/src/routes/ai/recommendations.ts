import { Router } from "express";
import { prisma } from "../../prisma";
import { requireUuidParam } from "../../lib/validation";
import { generateRecommendations, serializeRecommendation } from "../../lib/ai/recommendation";

// Port of app/modules/ai/api/recommendation.py — generate + list only.
// apply/dismiss/undo are deliberately deferred (see Phase 8 handoff): they
// drag in update_financial_intelligence_pipeline, which needs Redis cache
// *setters* that don't exist in Node yet.
export const recommendationRouter = Router();

recommendationRouter.post("/recommendations/generate", async (req, res, next) => {
  try {
    res.status(201).json(await generateRecommendations());
  } catch (e) {
    next(e);
  }
});

// Port of the bare (non-/recommendation-prefixed) seed_recommendations route
// — same generate_recommendations() call, wrapped in a different response
// envelope with an ext_id alias on each item. Mounted separately at bare
// /api/v1, matching Python's bare_router.
export const recommendationSeedRouter = Router();

recommendationSeedRouter.post("/aureon/recommendations/seed", async (req, res, next) => {
  try {
    const recs = await generateRecommendations();
    const items = recs.map((r) => ({ ...r, ext_id: r.id }));
    res.json({ status: "success", count: items.length, items });
  } catch (e) {
    next(e);
  }
});

recommendationRouter.get("/recommendations", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const recs = await prisma.recommendations.findMany(status ? { where: { status } } : undefined);
    res.json(await Promise.all(recs.map((r) => serializeRecommendation(r))));
  } catch (e) {
    next(e);
  }
});

recommendationRouter.get("/recommendations/:id", async (req, res, next) => {
  try {
    requireUuidParam(req.params.id, "recommendation_id");
    const rec = await prisma.recommendations.findUnique({ where: { id: req.params.id } });
    if (!rec) {
      res.status(404).json({ detail: "Recommendation not found" });
      return;
    }
    res.json(await serializeRecommendation(rec));
  } catch (e) {
    next(e);
  }
});

import { Router } from "express";
import { prisma } from "../../prisma";
import { requireUuidParam } from "../../lib/validation";
import { getCurrentUser } from "../../lib/users";
import {
  generateRecommendations,
  serializeRecommendation,
  applyRecommendation,
  dismissRecommendation,
  undoRecommendation,
  heldAssetIds,
} from "../../lib/ai/recommendation";

// Port of app/modules/ai/api/recommendation.py — generate, list, and
// apply/dismiss/undo. NotFoundError/ValidationError thrown by the apply/
// dismiss/undo lib functions are handled by the central errorHandler
// (404/400), matching Python's per-route try/except HTTPException mapping.
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
    // Port of RecommendationRepository.get_all(): held-asset-filtered, not
    // every Recommendation row (recommendation.py:34/647).
    const assetIds = await heldAssetIds();
    const recs = await prisma.recommendations.findMany({
      where: status ? { asset_id: { in: assetIds }, status } : { asset_id: { in: assetIds } },
    });
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

recommendationRouter.post("/recommendations/:id/apply", async (req, res, next) => {
  try {
    requireUuidParam(req.params.id, "recommendation_id");
    const portfolioIdRaw = req.query.portfolio_id;
    let portfolioId: string | null = null;
    if (typeof portfolioIdRaw === "string") {
      requireUuidParam(portfolioIdRaw, "portfolio_id");
      portfolioId = portfolioIdRaw;
    }
    const user = await getCurrentUser();
    res.json(await applyRecommendation(req.params.id, portfolioId, user.id));
  } catch (e) {
    next(e);
  }
});

recommendationRouter.post("/recommendations/:id/dismiss", async (req, res, next) => {
  try {
    requireUuidParam(req.params.id, "recommendation_id");
    const reason = typeof req.query.reason === "string" ? req.query.reason : null;
    const user = await getCurrentUser();
    res.json(await dismissRecommendation(req.params.id, reason, user.id));
  } catch (e) {
    next(e);
  }
});

recommendationRouter.post("/recommendations/:id/undo", async (req, res, next) => {
  try {
    requireUuidParam(req.params.id, "recommendation_id");
    const user = await getCurrentUser();
    res.json(await undoRecommendation(req.params.id, user.id));
  } catch (e) {
    next(e);
  }
});

import { Router } from "express";
import { getAllRecent, getRecentNews } from "../../lib/news/news";

// Port of app/modules/news/api/news.py — mounted at /api/v1/news (matches
// Python's router.prefix="/news" + app-level "/api/v1").
export const newsRouter = Router();

newsRouter.get("/health", (_req, res) => {
  res.json({ module: "news", status: "ok" });
});

newsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getAllRecent(30));
  } catch (e) {
    next(e);
  }
});

newsRouter.get("/:symbol", async (req, res, next) => {
  try {
    res.json(await getRecentNews(req.params.symbol, 10));
  } catch (e) {
    next(e);
  }
});

import { Router } from "express";
import { getCurrentUser } from "../../lib/users";
import { NotFoundError } from "../../lib/errors";
import {
  getCustomThemesForUser,
  listThemes,
  getThemeDetail,
  getThemeSignals,
  getThemeNav,
  forkTheme,
  updateTheme,
  deleteTheme,
  getThemesForSymbol,
} from "../../lib/market/themes";

export const themesRouter = Router();

// Port of MarketService.list_themes (GET /market/themes).
themesRouter.get("/themes", async (_req, res) => {
  const user = await getCurrentUser();
  const customThemes = await getCustomThemesForUser(user.id);
  res.json(await listThemes(customThemes, user.id));
});

// Port of MarketService.get_theme_detail.
themesRouter.get("/themes/:themeId", async (req, res) => {
  const user = await getCurrentUser();
  const customThemes = await getCustomThemesForUser(user.id);
  res.json(await getThemeDetail(req.params.themeId, customThemes));
});

// Port of MarketService.get_theme_signals.
themesRouter.get("/themes/:themeId/signals", async (req, res) => {
  const user = await getCurrentUser();
  const customThemes = await getCustomThemesForUser(user.id);
  res.json(await getThemeSignals(req.params.themeId, customThemes));
});

// Port of MarketService.get_theme_nav. NotFoundError maps to 422 when the
// message is about missing price history, 404 otherwise — matches Python's
// explicit status_code branch in market.py's get_theme_nav route (not the
// generic errorHandler's NotFoundError->404).
themesRouter.get("/themes/:themeId/nav", async (req, res, next) => {
  try {
    const user = await getCurrentUser();
    const customThemes = await getCustomThemesForUser(user.id);
    const daysParam = req.query.days;
    const days = daysParam !== undefined ? Number(daysParam) : 365;
    res.json(await getThemeNav(req.params.themeId, days, customThemes));
  } catch (e) {
    if (e instanceof NotFoundError) {
      const status = e.message.toLowerCase().includes("price history") ? 422 : 404;
      res.status(status).json({ detail: e.message });
      return;
    }
    next(e);
  }
});

// Port of MarketService.fork_theme (POST /market/themes/{theme_id}/fork).
themesRouter.post("/themes/:themeId/fork", async (req, res) => {
  const user = await getCurrentUser();
  const customThemes = await getCustomThemesForUser(user.id);
  const newId = await forkTheme(req.params.themeId, req.body.name, user.id, customThemes);
  const refreshed = await getCustomThemesForUser(user.id);
  res.json(refreshed[newId]);
});

// Port of MarketService.update_theme (PUT /market/themes/{theme_id}).
// NotFoundError ("Not authorized or theme not found") maps to 403 here —
// matches Python's explicit HTTPException(403), not the generic
// errorHandler's NotFoundError->404.
themesRouter.put("/themes/:themeId", async (req, res, next) => {
  try {
    const user = await getCurrentUser();
    await updateTheme(req.params.themeId, req.body.name, req.body.weights, user.id);
    const refreshed = await getCustomThemesForUser(user.id);
    res.json(refreshed[req.params.themeId]);
  } catch (e) {
    if (e instanceof NotFoundError) {
      res.status(403).json({ detail: e.message });
      return;
    }
    next(e);
  }
});

// Port of MarketService.delete_theme. Same 403-via-NotFoundError mapping as
// the PUT route above.
themesRouter.delete("/themes/:themeId", async (req, res, next) => {
  try {
    const user = await getCurrentUser();
    await deleteTheme(req.params.themeId, user.id);
    res.json({ status: "deleted", theme_id: req.params.themeId });
  } catch (e) {
    if (e instanceof NotFoundError) {
      res.status(403).json({ detail: e.message });
      return;
    }
    next(e);
  }
});

// Port of MarketService.get_themes_for_symbol (GET /market/themes-for/{symbol}).
themesRouter.get("/themes-for/:symbol", async (req, res) => {
  const user = await getCurrentUser();
  const customThemes = await getCustomThemesForUser(user.id);
  res.json(getThemesForSymbol(req.params.symbol, customThemes));
});

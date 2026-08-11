import { Router } from "express";
import { requireUuidParam } from "../../lib/validation";
import {
  getAssetSnapshot,
  getAssetFeatures,
  getIndices,
  getMovers,
  searchMarket,
  getUniverse,
  refreshMarket,
} from "../../lib/market/market";

export const marketRouter = Router();

// Port of MarketService.get_asset_snapshot (GET /market/assets/{asset_id}/snapshot).
marketRouter.get("/assets/:assetId/snapshot", async (req, res) => {
  requireUuidParam(req.params.assetId, "asset_id");
  res.json(await getAssetSnapshot(req.params.assetId));
});

// Port of MarketService.get_asset_features (GET /market/assets/{asset_id}/features).
marketRouter.get("/assets/:assetId/features", async (req, res) => {
  requireUuidParam(req.params.assetId, "asset_id");
  res.json(await getAssetFeatures(req.params.assetId));
});

// Port of MarketService.get_indices.
marketRouter.get("/indices", async (_req, res) => {
  res.json(await getIndices());
});

// Port of MarketService.get_movers.
marketRouter.get("/movers", async (_req, res) => {
  res.json(await getMovers());
});

// Port of MarketService.search (GET /market/search).
marketRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "");
  res.json(await searchMarket(q));
});

// Port of MarketService.get_universe (GET /market/universe). Python's
// `live` query param is accepted but unused by get_universe(search=search)
// — same no-op here, not implemented differently.
marketRouter.get("/universe", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  res.json(await getUniverse(search));
});

// Port of the POST /market/refresh Celery dispatch.
marketRouter.post("/refresh", async (_req, res) => {
  res.json(await refreshMarket());
});

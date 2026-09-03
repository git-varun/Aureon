import {Router} from "express";
import {requireQueryParam, requireUuidParam} from "../../lib/validation";
import {
  getAssetFeatures,
  getAssetSnapshot,
  getIndices,
  getMovers,
  getUniverse,
  refreshMarket,
  searchMarket,
  triggerBackfill,
} from "../../lib/market/market";
import {getCryptoContext} from "../../lib/marketProviders/coingecko";

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

// Port of MarketService.search (GET /market/search). Python declares `q` as
// `Query(...)` (required) — absent (not just empty) 422s, matching FastAPI.
marketRouter.get("/search", async (req, res) => {
  const q = requireQueryParam(req.query.q, "q");
  res.json(await searchMarket(q));
});

// Port of MarketService.get_universe (GET /market/universe). Python's
// `live` query param is accepted but unused by get_universe(search=search)
// — same no-op here, not implemented differently.
marketRouter.get("/universe", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  res.json(await getUniverse(search));
});

// Market-wide crypto context (trending coins, global cap/dominance) — new,
// not a Python port. Redis-cached 5min server-side; the two CoinGecko calls
// behind this consume the entire 2-calls/60s budget for that provider.
marketRouter.get("/crypto-context", async (_req, res) => {
    res.json(await getCryptoContext());
});

// Port of the POST /market/refresh Celery dispatch.
marketRouter.post("/refresh", async (_req, res) => {
  res.json(await refreshMarket());
});

// Port of POST /market/symbols/{symbol}/backfill (market.py:142). Cut over
// as part of Task 10's route audit — deferred since Task 1, now ported so
// vite.config.js can stop routing it to Python before backend/ is deleted.
marketRouter.post("/symbols/:symbol/backfill", async (req, res) => {
  res.json(await triggerBackfill(req.params.symbol));
});

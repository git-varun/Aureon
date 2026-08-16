import { Router } from "express";
import { prisma } from "../../prisma";
import { NotFoundError } from "../../lib/errors";
import { getCachedQuote } from "../../lib/marketProviders/redisRateLimit";
import { getChart } from "../../lib/marketProviders/chart";
import { getFundamentals } from "../../lib/marketProviders/fundamentals";
import { searchAssets, getBatch, getSignal, getAureonAsset } from "../../lib/market/assets";
import { requireUuidParam, requireQueryParam } from "../../lib/validation";
import { toPythonIsoString } from "../../lib/tz";

export const assetsRouter = Router();

// Port of AssetsService.search (GET /assets). Python declares `search` as
// `Query(...)` (required) — absent (not just empty) 422s, matching FastAPI.
assetsRouter.get("/assets", async (req, res) => {
  const search = requireQueryParam(req.query.search, "search");
  res.json(await searchAssets(search));
});

// Port of AssetsService.get_batch (GET /assets/batch). Python declares
// `symbols` as `Query(...)` (required) — absent (not just empty) 422s.
assetsRouter.get("/assets/batch", async (req, res) => {
  const symbolsParam = requireQueryParam(req.query.symbols, "symbols");
  const symbolList = symbolsParam.split(",").filter((s) => s.trim());
  res.json({ data: await getBatch(symbolList) });
});

// Port of AssetsService.get_quote — cache+DB read only, no live provider
// call (matches Python: /assets/{symbol}/quote never calls a provider live).
assetsRouter.get("/assets/:symbol/quote", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase().trim();
  const cached = await getCachedQuote(symbol);
  const quote = await prisma.latestQuote.findUnique({ where: { symbol } });

  let price: number;
  if (cached) {
    price = Number(cached.price);
  } else {
    if (!quote) throw new NotFoundError("Asset not found");
    price = Number(quote.price);
  }

  res.json({
    symbol,
    asset_id: quote?.assetId ?? null,
    price,
    last_price: price,
    open: null,
    previous_close: null,
    high: null,
    low: null,
    high_52w: null,
    low_52w: null,
    last_updated: toPythonIsoString(new Date()),
  });
});

// Port of AssetsService.get_chart.
assetsRouter.get("/assets/:symbol/chart", async (req, res) => {
  const days = req.query.days ? Number(req.query.days) : 365;
  const chart = await getChart(req.params.symbol, days);
  res.json(chart);
});

// Port of AssetsService.get_fundamentals.
assetsRouter.get("/assets/:symbol/fundamentals", async (req, res) => {
  const refresh = req.query.refresh === "true";
  const fundamentals = await getFundamentals(req.params.symbol, refresh);
  res.json(fundamentals);
});

// Port of AssetsService.get_signal (GET /signals/{symbol}).
assetsRouter.get("/signals/:symbol", async (req, res) => {
  res.json(await getSignal(req.params.symbol));
});

// Port of assets.py's generate_signal_for_symbol — this endpoint was never
// a real implementation in Python either (see its BACKLOG comment: it used
// to return a hardcoded {"signal": "BUY"} for any symbol, a fabricated
// investment recommendation, since removed as a no-fake-data violation).
// Real per-symbol signals exist at GET /signals/{symbol} above; the
// frontend does not call this endpoint (see TechnicalTab.jsx). Faithfully
// ported as the same 501, not a fabricated 200.
assetsRouter.post("/signals/generate/:symbol", (_req, res) => {
  res.status(501).json({ detail: "Signal generation via this endpoint is not implemented." });
});

// Port of AssetsService.get_aureon_asset (GET /aureon/assets/{ticker}).
// portfolio_id is an explicit, optional query param — not "the first
// portfolio" — same fix as the manual-asset endpoints.
assetsRouter.get("/aureon/assets/:ticker", async (req, res) => {
  const portfolioIdRaw = req.query.portfolio_id;
  let portfolioId: string | null = null;
  if (typeof portfolioIdRaw === "string" && portfolioIdRaw.length > 0) {
    requireUuidParam(portfolioIdRaw, "portfolio_id");
    portfolioId = portfolioIdRaw;
  }
  res.json(await getAureonAsset(req.params.ticker, portfolioId));
});

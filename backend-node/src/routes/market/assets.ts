import { Router } from "express";
import { prisma } from "../../prisma";
import { NotFoundError } from "../../lib/errors";
import { getCachedQuote } from "../../lib/marketProviders/redisRateLimit";
import { getChart } from "../../lib/marketProviders/chart";
import { getFundamentals } from "../../lib/marketProviders/fundamentals";

export const assetsRouter = Router();

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
    last_updated: new Date().toISOString(),
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

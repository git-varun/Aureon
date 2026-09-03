import {Router} from "express";
import {prisma} from "../../prisma";
import {NotFoundError, RequestValidationError} from "../../lib/errors";
import {requireUuidParam} from "../../lib/validation";
import type {PositionPrice} from "../../lib/prices";
import {resolvePositionsPriceMap} from "../../lib/prices";
import {generatePortfolioSnapshot, getPortfolioHistory, serializeSnapshotForCache} from "../../lib/snapshot";
import {cachePortfolioSnapshot, getCachedPortfolioSnapshot} from "../../lib/portfolioCache";
import type {Position} from "../../generated/prisma";

export const positionsRouter = Router();

function serializePosition(p: Position, price: PositionPrice) {
  return {
    id: p.id,
    portfolio_id: p.portfolioId,
    symbol: p.symbol,
    quantity: Number(p.quantity),
    avg_buy_price: Number(p.avgBuyPrice),
    wallet: p.wallet,
    leverage: p.leverage !== null ? Number(p.leverage) : null,
    liquidation_price: p.liquidationPrice !== null ? Number(p.liquidationPrice) : null,
    unrealized_pnl: p.unrealizedPnl !== null ? Number(p.unrealizedPnl) : null,
    margin_usd: p.marginUsd !== null ? Number(p.marginUsd) : null,
    side: p.side,
    created_at: p.createdAt,
    price: price.price,
    price_source: price.price_source,
    quote_age_status: price.quote_age_status,
    quote_updated_at: price.quote_updated_at,
    epf_estimate_basis: price.epf_estimate_basis,
    currency: price.currency,
    unavailable_reason: price.unavailable_reason,
  };
}

// Port of GET /portfolios/{portfolio_id}/positions.
positionsRouter.get("/:id/positions", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const portfolio = await prisma.portfolio.findUnique({ where: { id: req.params.id } });
  if (!portfolio) throw new NotFoundError("Portfolio not found");

  const positionsList = await prisma.position.findMany({ where: { portfolioId: portfolio.id } });
  const prices = await resolvePositionsPriceMap(positionsList);
  res.json(positionsList.map((p) => serializePosition(p, prices.get(p.id)!)));
});

function serializeSnapshotResponse(s: {
    portfolio_id: string;
    market_value: number | null;
    cash_balance: number | null;
    daily_return: number | null;
    total_return: number | null;
    realized_pnl: number | null;
    updated_at: string
}) {
  return {
    portfolio_id: s.portfolio_id,
    market_value: s.market_value,
    cash_balance: s.cash_balance,
    daily_return: s.daily_return,
    total_return: s.total_return,
      realized_pnl: s.realized_pnl,
    updated_at: s.updated_at,
  };
}

// Port of GET /portfolios/{portfolio_id}/snapshot. Cache-first (900s TTL,
// same key Python reads/writes); on a miss, regenerates fresh rather than
// trusting a possibly-stale persisted snapshots row — see Python's comment.
positionsRouter.get("/:id/snapshot", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const portfolio = await prisma.portfolio.findUnique({ where: { id: req.params.id } });
  if (!portfolio) throw new NotFoundError("Portfolio not found");

  const cached = await getCachedPortfolioSnapshot(portfolio.id);
  if (cached) {
    res.json(serializeSnapshotResponse(cached as unknown as Parameters<typeof serializeSnapshotResponse>[0]));
    return;
  }

  const snapshot = await generatePortfolioSnapshot(portfolio.id);
  await cachePortfolioSnapshot(portfolio.id, serializeSnapshotForCache(snapshot));
  res.json(serializeSnapshotResponse(snapshot));
});

// Port of POST /portfolios/{portfolio_id}/snapshot — always regenerates.
positionsRouter.post("/:id/snapshot", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const portfolio = await prisma.portfolio.findUnique({ where: { id: req.params.id } });
  if (!portfolio) throw new NotFoundError("Portfolio not found");

  const snapshot = await generatePortfolioSnapshot(portfolio.id);
  await cachePortfolioSnapshot(portfolio.id, serializeSnapshotForCache(snapshot));
  res.json(serializeSnapshotResponse(snapshot));
});

// Port of GET /portfolios/{portfolio_id}/history.
positionsRouter.get("/:id/history", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const portfolio = await prisma.portfolio.findUnique({ where: { id: req.params.id } });
  if (!portfolio) throw new NotFoundError("Portfolio not found");

  const daysRaw = req.query.days;
  let days = 90;
  if (daysRaw !== undefined) {
    const parsed = Number(daysRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1825) {
      throw new RequestValidationError("days must be an integer between 1 and 1825");
    }
    days = parsed;
  }

  res.json(await getPortfolioHistory(portfolio.id, days));
});


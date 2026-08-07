import { Router } from "express";
import { prisma } from "../../prisma";
import { NotFoundError } from "../../lib/errors";
import { requireUuidParam } from "../../lib/validation";
import { resolvePositionsPriceMap } from "../../lib/prices";
import type { Position } from "../../generated/prisma";
import type { PositionPrice } from "../../lib/prices";

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

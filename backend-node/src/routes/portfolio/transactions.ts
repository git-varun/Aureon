import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma";
import { NotFoundError, RequestValidationError } from "../../lib/errors";
import { requireUuidParam } from "../../lib/validation";
import { ensureAssetExists } from "../../lib/assets";
import { recalculatePosition } from "../../lib/positions";
import { inferCurrency } from "../../lib/currency";
import { invalidatePortfolioCaches } from "../../lib/portfolioCache";
import type { Transaction } from "../../generated/prisma";

export const transactionsRouter = Router();

function serializeTransaction(t: Transaction, currency: string | null) {
  return {
    id: t.id,
    portfolio_id: t.portfolioId,
    symbol: t.symbol,
    transaction_type: t.transactionType,
    quantity: Number(t.quantity),
    price: Number(t.price),
    transaction_date: t.transactionDate,
    fees: Number(t.fees),
    taxes: Number(t.taxes),
    notes: t.notes,
    broker: t.broker,
    broker_reference: t.brokerReference,
    kind: t.kind,
    recommendation_id: t.recommendationId,
    created_at: t.createdAt,
    currency,
  };
}

interface TransactionCreateBody {
  symbol?: unknown;
  transaction_type?: unknown;
  quantity?: unknown;
  price?: unknown;
  transaction_date?: unknown;
  fees?: unknown;
  taxes?: unknown;
  notes?: unknown;
  broker?: unknown;
  broker_reference?: unknown;
}

function validateCreateBody(body: TransactionCreateBody): string | null {
  if (typeof body.symbol !== "string" || body.symbol.length < 1) return "symbol is required";
  if (typeof body.transaction_type !== "string" || body.transaction_type.length < 1) return "transaction_type is required";
  if (typeof body.quantity !== "number" || !(body.quantity > 0)) return "quantity must be > 0";
  if (typeof body.price !== "number" || !(body.price >= 0)) return "price must be >= 0";
  if (typeof body.transaction_date !== "string" || Number.isNaN(Date.parse(body.transaction_date))) return "transaction_date is required";
  if (body.fees !== undefined && (typeof body.fees !== "number" || body.fees < 0)) return "fees must be >= 0";
  if (body.taxes !== undefined && (typeof body.taxes !== "number" || body.taxes < 0)) return "taxes must be >= 0";
  return null;
}

// Port of PortfolioService.record_transaction (kind="trade", as called by the
// real API route). Note: unlike list_transactions, the created row's
// `currency` field is left null in the response here — record_transaction
// never annotates it, matching the Python original (only list_transactions
// computes it via infer_currency).
transactionsRouter.post("/:id/transactions", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const body = req.body as TransactionCreateBody;
  const validationError = validateCreateBody(body);
  if (validationError) {
    throw new RequestValidationError(validationError);
  }

  const portfolio = await prisma.portfolio.findUnique({ where: { id: req.params.id } });
  if (!portfolio) throw new NotFoundError("Portfolio not found");

  const symbol = (body.symbol as string).toUpperCase().trim();
  const transactionType = (body.transaction_type as string).toUpperCase().trim();

  const txn = await prisma.$transaction(async (tx) => {
    const assetId = await ensureAssetExists(tx, symbol);
    const created = await tx.transaction.create({
      data: {
        id: uuidv4(),
        portfolioId: portfolio.id,
        symbol,
        assetId,
        transactionType,
        quantity: body.quantity as number,
        price: body.price as number,
        transactionDate: new Date(body.transaction_date as string),
        fees: (body.fees as number) ?? 0.0,
        taxes: (body.taxes as number) ?? 0.0,
        notes: (body.notes as string) ?? null,
        broker: (body.broker as string) ?? null,
        brokerReference: (body.broker_reference as string) ?? null,
        kind: "trade",
        wallet: "spot",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await recalculatePosition(tx, portfolio.id, symbol);
    return created;
  });
  await invalidatePortfolioCaches(portfolio.id);

  res.status(201).json(serializeTransaction(txn, null));
});

// Port of PortfolioService.list_transactions.
transactionsRouter.get("/:id/transactions", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const portfolio = await prisma.portfolio.findUnique({ where: { id: req.params.id } });
  if (!portfolio) throw new NotFoundError("Portfolio not found");

  const txns = await prisma.transaction.findMany({
    where: { portfolioId: portfolio.id },
    orderBy: { transactionDate: "asc" },
  });

  const assetIds = [...new Set(txns.map((t) => t.assetId).filter((id): id is string => !!id))];
  const assetsById = new Map<string, { assetClass: string; metadata: unknown }>();
  if (assetIds.length > 0) {
    for (const a of await prisma.asset.findMany({ where: { id: { in: assetIds } } })) {
      assetsById.set(a.id, a);
    }
  }

  res.json(
    txns.map((t) => {
      const asset = t.assetId ? assetsById.get(t.assetId) : undefined;
      const currency = inferCurrency(asset?.assetClass ?? null, t.symbol, asset?.metadata ?? null);
      return serializeTransaction(t, currency);
    }),
  );
});

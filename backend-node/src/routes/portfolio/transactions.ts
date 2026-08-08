import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma";
import { NotFoundError, RequestValidationError } from "../../lib/errors";
import { requireUuidParam } from "../../lib/validation";
import { ensureAssetExists } from "../../lib/assets";
import { recalculatePosition } from "../../lib/positions";
import { inferCurrency } from "../../lib/currency";
import { invalidatePortfolioCaches } from "../../lib/portfolioCache";
import { getSessionTimeZone, naiveToUtc, toPythonIsoString } from "../../lib/tz";
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

// Port of PortfolioService.get_broker_transaction_coverage /
// TransactionsRepository.get_last_real_transaction_dates_by_broker. Registered
// before /:id/transactions/:txnId — same reason as Python's comment at
// portfolio.py:382-384: a path-param route would otherwise greedily match
// "broker-coverage" as txnId (Express, like FastAPI/Starlette, matches routes
// in registration order).
transactionsRouter.get("/:id/transactions/broker-coverage", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const portfolio = await prisma.portfolio.findUnique({ where: { id: req.params.id } });
  if (!portfolio) throw new NotFoundError("Portfolio not found");

  // Restricted to kind in ("trade", "broker_trade") — deliberately excludes
  // "broker_snapshot" (re-stamped to "now" on every sync, so it would always
  // read as "0 days ago"). See the Python repo docstring for the full story.
  const rows = await prisma.transaction.groupBy({
    by: ["broker"],
    where: { portfolioId: portfolio.id, broker: { not: null }, kind: { in: ["trade", "broker_trade"] } },
    _max: { transactionDate: true },
  });

  const tzName = await getSessionTimeZone();
  const coverage: Record<string, string | null> = {};
  for (const row of rows) {
    if (!row.broker || !row._max.transactionDate) continue;
    coverage[row.broker] = toPythonIsoString(naiveToUtc(row._max.transactionDate, tzName));
  }
  res.json(coverage);
});

// Port of PortfolioService.get_transaction, called via the
// /portfolios/{id}/transactions/{txn_id} route which also verifies the
// transaction belongs to the URL's portfolio_id.
transactionsRouter.get("/:id/transactions/:txnId", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  requireUuidParam(req.params.txnId, "txn_id");
  const txn = await prisma.transaction.findUnique({ where: { id: req.params.txnId } });
  if (!txn) throw new NotFoundError("Transaction not found");
  if (txn.portfolioId !== req.params.id) throw new NotFoundError("Transaction not found in this portfolio");

  // get_transaction (unlike list_transactions) never calls infer_currency in
  // Python — currency is left null here to match.
  res.json(serializeTransaction(txn, null));
});

interface TransactionUpdateBody {
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

function validateUpdateBody(body: TransactionUpdateBody): string | null {
  if (body.symbol !== undefined && (typeof body.symbol !== "string" || body.symbol.length < 1)) return "symbol must be a non-empty string";
  if (body.transaction_type !== undefined && (typeof body.transaction_type !== "string" || body.transaction_type.length < 1)) return "transaction_type must be a non-empty string";
  if (body.quantity !== undefined && (typeof body.quantity !== "number" || !(body.quantity > 0))) return "quantity must be > 0";
  if (body.price !== undefined && (typeof body.price !== "number" || !(body.price >= 0))) return "price must be >= 0";
  if (body.transaction_date !== undefined && (typeof body.transaction_date !== "string" || Number.isNaN(Date.parse(body.transaction_date)))) return "transaction_date must be a valid date";
  if (body.fees !== undefined && (typeof body.fees !== "number" || body.fees < 0)) return "fees must be >= 0";
  if (body.taxes !== undefined && (typeof body.taxes !== "number" || body.taxes < 0)) return "taxes must be >= 0";
  return null;
}

// Port of PortfolioService.update_transaction.
transactionsRouter.put("/:id/transactions/:txnId", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  requireUuidParam(req.params.txnId, "txn_id");
  const body = req.body as TransactionUpdateBody;
  const validationError = validateUpdateBody(body);
  if (validationError) throw new RequestValidationError(validationError);

  const existing = await prisma.transaction.findUnique({ where: { id: req.params.txnId } });
  if (!existing) throw new NotFoundError("Transaction not found");
  if (existing.portfolioId !== req.params.id) throw new NotFoundError("Transaction not found in this portfolio");

  const oldSymbol = existing.symbol;
  const newSymbol = typeof body.symbol === "string" ? body.symbol.toUpperCase().trim() : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (newSymbol !== undefined) {
      data.symbol = newSymbol;
      data.assetId = await ensureAssetExists(tx, newSymbol);
    }
    if (typeof body.transaction_type === "string") data.transactionType = body.transaction_type.toUpperCase().trim();
    if (typeof body.quantity === "number") data.quantity = body.quantity;
    if (typeof body.price === "number") data.price = body.price;
    if (typeof body.transaction_date === "string") data.transactionDate = new Date(body.transaction_date);
    if (typeof body.fees === "number") data.fees = body.fees;
    if (typeof body.taxes === "number") data.taxes = body.taxes;
    // Matches Python's `if notes is not None: txn.notes = notes` — an
    // explicit `null` in the request body is indistinguishable from omitted
    // once parsed (Optional[str] = None) and must NOT clear the field, only
    // a real string value updates it.
    if (typeof body.notes === "string") data.notes = body.notes;
    if (typeof body.broker === "string") data.broker = body.broker;
    if (typeof body.broker_reference === "string") data.brokerReference = body.broker_reference;

    const saved = await tx.transaction.update({ where: { id: existing.id }, data });

    // Recalculate old and new symbol positions — matches update_transaction's
    // ordering exactly.
    await recalculatePosition(tx, existing.portfolioId, oldSymbol);
    if (newSymbol !== undefined && newSymbol !== oldSymbol) {
      await recalculatePosition(tx, existing.portfolioId, newSymbol);
    }
    return saved;
  });
  await invalidatePortfolioCaches(existing.portfolioId);

  res.json(serializeTransaction(updated, null));
});

// Port of PortfolioService.delete_transaction.
transactionsRouter.delete("/:id/transactions/:txnId", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  requireUuidParam(req.params.txnId, "txn_id");
  const existing = await prisma.transaction.findUnique({ where: { id: req.params.txnId } });
  if (!existing) throw new NotFoundError("Transaction not found");
  if (existing.portfolioId !== req.params.id) throw new NotFoundError("Transaction not found in this portfolio");

  const deleted = await prisma.$transaction(async (tx) => {
    await tx.transaction.delete({ where: { id: existing.id } });
    await recalculatePosition(tx, existing.portfolioId, existing.symbol);
    return true;
  });
  await invalidatePortfolioCaches(existing.portfolioId);

  res.json({ success: deleted });
});

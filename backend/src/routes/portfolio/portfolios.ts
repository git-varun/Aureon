import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma";
import { NotFoundError, ConflictError, RequestValidationError } from "../../lib/errors";
import { requireUuidParam } from "../../lib/validation";
import { logAuditAction } from "../../lib/audit";
import { getCurrentUser } from "../../lib/users";
import { invalidatePortfolioCaches } from "../../lib/portfolioCache";
import type { Portfolio } from "../../generated/prisma";

export const portfoliosRouter = Router();

function serializePortfolio(p: Portfolio) {
  return {
    id: p.id,
    name: p.name,
    is_archived: p.isArchived,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

// FastAPI's Query(bool) accepts true/1/yes/on (case-insensitive) in addition
// to "true" — matched here so ?include_archived=1 behaves the same way.
function parseBool(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

async function getPortfolioOr404(portfolioId: string): Promise<Portfolio> {
  requireUuidParam(portfolioId, "portfolio_id");
  const portfolio = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!portfolio) throw new NotFoundError("Portfolio not found");
  return portfolio;
}

// Port of PortfolioService.create_portfolio.
portfoliosRouter.post("/", async (req, res) => {
  const name = req.body?.name;
  if (typeof name !== "string" || name.length < 1 || name.length > 100) {
    throw new RequestValidationError("name must be a string between 1 and 100 characters");
  }
  const user = await getCurrentUser();
  const portfolio = await prisma.$transaction(async (tx) => {
    const created = await tx.portfolio.create({
      data: { id: uuidv4(), name, isArchived: false, createdAt: new Date(), updatedAt: new Date() },
    });
    await logAuditAction(tx, "portfolio_create", "portfolio", user.id, created.id, { name });
    return created;
  });
  res.status(201).json(serializePortfolio(portfolio));
});

// Port of PortfolioService.list_portfolios.
portfoliosRouter.get("/", async (req, res) => {
  const includeArchived = parseBool(req.query.include_archived);
  const portfolios = await prisma.portfolio.findMany({
    where: includeArchived ? {} : { isArchived: false },
  });
  res.json(portfolios.map(serializePortfolio));
});

// Port of PortfolioService.get_portfolio.
portfoliosRouter.get("/:id", async (req, res) => {
  const portfolio = await getPortfolioOr404(req.params.id);
  res.json(serializePortfolio(portfolio));
});

// Port of PortfolioService.update_portfolio.
portfoliosRouter.put("/:id", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const name = req.body?.name;
  if (typeof name !== "string" || name.length < 1 || name.length > 100) {
    throw new RequestValidationError("name must be a string between 1 and 100 characters");
  }
  const user = await getCurrentUser();
  const portfolio = await prisma.$transaction(async (tx) => {
    const existing = await tx.portfolio.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError("Portfolio not found");
    const updated = await tx.portfolio.update({
      where: { id: existing.id },
      data: { name, updatedAt: new Date() },
    });
    await logAuditAction(tx, "portfolio_update", "portfolio", user.id, updated.id, { old_name: existing.name, new_name: name });
    return updated;
  });
  res.json(serializePortfolio(portfolio));
});

// Port of PortfolioService.archive_portfolio (soft-delete).
portfoliosRouter.post("/:id/archive", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const user = await getCurrentUser();
  const portfolio = await prisma.$transaction(async (tx) => {
    const existing = await tx.portfolio.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError("Portfolio not found");
    const updated = await tx.portfolio.update({ where: { id: existing.id }, data: { isArchived: true, updatedAt: new Date() } });
    await logAuditAction(tx, "portfolio_archive", "portfolio", user.id, existing.id, { name: existing.name });
    return updated;
  });
  await invalidatePortfolioCaches(portfolio.id);
  res.json(serializePortfolio(portfolio));
});

// Port of PortfolioService.unarchive_portfolio.
portfoliosRouter.post("/:id/unarchive", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const user = await getCurrentUser();
  const portfolio = await prisma.$transaction(async (tx) => {
    const existing = await tx.portfolio.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError("Portfolio not found");
    const updated = await tx.portfolio.update({ where: { id: existing.id }, data: { isArchived: false, updatedAt: new Date() } });
    await logAuditAction(tx, "portfolio_unarchive", "portfolio", user.id, existing.id, { name: existing.name });
    return updated;
  });
  await invalidatePortfolioCaches(portfolio.id);
  res.json(serializePortfolio(portfolio));
});

// Port of PortfolioService.delete_portfolio — hard, cascade delete.
// require_archived defaults to true (the only mode reachable from this real
// API route): a portfolio still active/visible can't be hard-deleted in one
// call, it must be archived first. This is the friction gate.
portfoliosRouter.delete("/:id", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const user = await getCurrentUser();
  const deleted = await prisma.$transaction(async (tx) => {
    const existing = await tx.portfolio.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError("Portfolio not found");
    if (!existing.isArchived) {
      throw new ConflictError("Portfolio must be archived before it can be permanently deleted");
    }
    await tx.portfolio.delete({ where: { id: existing.id } });
    await logAuditAction(tx, "portfolio_delete", "portfolio", user.id, existing.id, { name: existing.name });
    return true;
  });
  if (deleted) await invalidatePortfolioCaches(req.params.id);
  res.json({ success: deleted });
});

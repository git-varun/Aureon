import { v4 as uuidv4 } from "uuid";
import { prisma } from "../prisma";
import type { Prisma } from "../generated/prisma";

type Tx = Prisma.TransactionClient;

// Port of app/core/constants.py DEFAULT_USER_ID.
export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000";

/** Port of app/api/dependencies.py get_current_user: resolves/creates the
 * single-user canonical User row used for audit-log actor_id scoping. */
export async function getCurrentUser(): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({ where: { id: DEFAULT_USER_ID } });
  if (existing) return existing;
  const now = new Date();
  return prisma.user.create({
    data: {
      id: DEFAULT_USER_ID,
      email: "local@aureon.app",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  });
}

/** Port of app/api/dependencies.py get_user_context: resolves-or-creates the
 * default Portfolio row (`db.query(Portfolio).first()`, no ordering; creates
 * one named "Default Portfolio" if none exists). Accepts a transaction
 * client so callers (e.g. restore) can keep this inside their own atomic
 * transaction. */
export async function getUserContext(tx: Tx): Promise<string> {
  const portfolio = await tx.portfolio.findFirst();
  if (portfolio) return portfolio.id;
  const created = await tx.portfolio.create({
    data: { id: uuidv4(), name: "Default Portfolio", isArchived: false, createdAt: new Date(), updatedAt: new Date() },
  });
  return created.id;
}

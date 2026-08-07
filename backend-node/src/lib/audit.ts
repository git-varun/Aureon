import { v4 as uuidv4 } from "uuid";
import type { Prisma } from "../generated/prisma";

type Tx = Prisma.TransactionClient;

/** Port of app/core/services/audit.py log_audit_action. */
export async function logAuditAction(
  tx: Tx,
  action: string,
  entityType: string,
  actorId?: string | null,
  entityId?: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      id: uuidv4(),
      actorId: actorId ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      details: (details ?? {}) as Prisma.InputJsonValue,
      createdAt: new Date(),
    },
  });
}

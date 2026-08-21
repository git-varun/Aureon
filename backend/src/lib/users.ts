import { prisma } from "../prisma";

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

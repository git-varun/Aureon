import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma";
import { getCurrentUser } from "../../lib/users";
import { RequestValidationError } from "../../lib/errors";
import type { web_notifications } from "../../generated/prisma";

export const notificationsRouter = Router();

function serializeNotification(n: web_notifications) {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    read: n.read,
    created_at: n.created_at ? n.created_at.toISOString() : null,
  };
}

// Port of NotificationService.get_notifications_by_user /
// WebNotificationsRepository.list_by_user — visible notifications are the
// user's own PLUS any broadcast row (user_id IS NULL), newest first.
notificationsRouter.get("/", async (_req, res) => {
  const user = await getCurrentUser();
  const rows = await prisma.web_notifications.findMany({
    where: { OR: [{ user_id: user.id }, { user_id: null }] },
    orderBy: { created_at: "desc" },
  });
  res.json(rows.map(serializeNotification));
});

interface NotificationCreateBody {
  title?: unknown;
  message?: unknown;
  type?: unknown;
}

// Port of NotificationService.create_notification.
notificationsRouter.post("/", async (req, res) => {
  const body = req.body as NotificationCreateBody;
  if (typeof body.title !== "string" || !body.title) throw new RequestValidationError("title is required");
  if (typeof body.message !== "string" || !body.message) throw new RequestValidationError("message is required");
  const type = typeof body.type === "string" ? body.type : "info";

  const user = await getCurrentUser();
  const now = new Date();
  const created = await prisma.web_notifications.create({
    data: { id: uuidv4(), user_id: user.id, title: body.title, message: body.message, type, read: false, created_at: now, updated_at: now },
  });
  res.json(serializeNotification(created));
});

// Port of NotificationService.mark_as_read, called via PUT /{id}/read.
// get_user_notification's same own-or-broadcast (user_id IS NULL) visibility
// rule applies here too — matches Python exactly.
async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
  const notification = await prisma.web_notifications.findFirst({
    where: { id: notificationId, OR: [{ user_id: userId }, { user_id: null }] },
  });
  if (!notification) return false;
  await prisma.web_notifications.update({ where: { id: notification.id }, data: { read: true, updated_at: new Date() } });
  return true;
}

notificationsRouter.put("/:id/read", async (req, res) => {
  const user = await getCurrentUser();
  const found = await markAsRead(req.params.id, user.id);
  if (!found) {
    res.status(404).json({ detail: `Notification ${req.params.id} not found` });
    return;
  }
  res.json({ message: "Notification marked as read" });
});

// Port of NotificationService via PUT /mark-all-read — best-effort per id,
// a not-found id is silently skipped (matches Python's bare `except
// NotFoundError: pass`), never fails the whole batch.
notificationsRouter.put("/mark-all-read", async (req, res) => {
  const ids = req.body as unknown;
  if (!Array.isArray(ids)) throw new RequestValidationError("body must be a list of notification ids");
  const user = await getCurrentUser();
  for (const id of ids) {
    if (typeof id === "string") await markAsRead(id, user.id);
  }
  res.json({ message: `${ids.length} notifications marked as read` });
});

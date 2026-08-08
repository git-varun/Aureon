import { v4 as uuidv4 } from "uuid";
import { prisma } from "../prisma";

export interface NotificationInput {
  userId: string | null;
  title: string;
  message: string;
  type?: string;
}

/** Port of NotificationService.create_notification — the only piece of it
 * needed so far: a plain insert into web_notifications. No Node route/service
 * exists yet for the rest of NotificationService (list/mark-read/etc.) —
 * out of scope for this phase, this is greenfield just to unblock
 * evaluate_watchlist_alerts's "fire" side. */
export async function createNotification(input: NotificationInput): Promise<void> {
  const now = new Date();
  await prisma.web_notifications.create({
    data: {
      id: uuidv4(),
      user_id: input.userId,
      title: input.title,
      message: input.message,
      type: input.type ?? "info",
      read: false,
      created_at: now,
      updated_at: now,
    },
  });
}

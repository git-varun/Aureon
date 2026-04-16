"""Notification services."""
import logging

from sqlalchemy.orm import Session
from typing import List
from app.modules.notification.models import Notification
from app.shared.exceptions import NotFoundError

logger = logging.getLogger("notification.service")


class NotificationService:
    def __init__(self, db: Session):
        self.db = db
        logger.debug("NotificationService initialised with session id=%s", id(db))

    def get_notifications_by_user(self, user_id: int) -> List[Notification]:
        logger.debug("get_notifications_by_user: user_id=%s", user_id)
        results = (
            self.db.query(Notification)
            .filter(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .all()
        )
        unread = sum(1 for n in results if not n.read)
        logger.info("get_notifications_by_user: user_id=%s → %d notifications (%d unread)",
                    user_id, len(results), unread)
        return results

    def create_notification(self, data: dict) -> Notification:
        logger.info(
            "create_notification: user_id=%s type=%s",
            data.get("user_id"), data.get("notification_type", data.get("type", "?"))
        )
        logger.debug("create_notification: payload=%s", data)

        notification = Notification(**data)
        self.db.add(notification)
        self.db.commit()
        self.db.refresh(notification)
        logger.info("create_notification: committed id=%s user_id=%s", notification.id, data.get("user_id"))
        return notification

    def mark_as_read(self, notification_id: int) -> None:
        logger.debug("mark_as_read: notification_id=%s", notification_id)

        notification = self.db.query(Notification).filter(Notification.id == notification_id).first()
        if not notification:
            logger.warning("mark_as_read: notification_id=%s not found", notification_id)
            raise NotFoundError(f"Notification {notification_id} not found")

        notification.read = True
        self.db.commit()
        logger.info("mark_as_read: notification_id=%s marked read (user_id=%s)",
                    notification_id, notification.user_id)

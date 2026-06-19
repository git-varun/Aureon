from app.domain.services.base import BaseService
import uuid
from typing import Any

from app.core.exceptions import NotFoundError
from app.domain.entities.notification import WebNotification
from app.infrastructure.repositories.notification import WebNotificationsRepository


class NotificationService(BaseService):
    def __init__(self, repo: WebNotificationsRepository):
        self.repo = repo

    def get_notifications_by_user(self, user_id: uuid.UUID) -> list[dict[str, Any]]:
        rows = self.repo.list_by_user(user_id)
        return [
            {
                "id": str(r.id),
                "title": r.title,
                "message": r.message,
                "type": r.type,
                "read": r.read,
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in rows
        ]

    def create_notification(self, data: dict[str, Any]) -> dict[str, Any]:
        # Support user_id as string or uuid
        user_id = data.get("user_id")
        if isinstance(user_id, str):
            user_id = uuid.UUID(user_id)

        notification = WebNotification(
            user_id=user_id,
            title=data["title"],
            message=data["message"],
            type=data.get("type", "info"),
            read=data.get("read", False)
        )
        self.repo.save(notification)
        self.repo.session.commit()
        self.repo.session.refresh(notification)
        return {
            "id": str(notification.id),
            "title": notification.title,
            "message": notification.message,
            "type": notification.type,
            "read": notification.read,
            "created_at": notification.created_at.isoformat() if notification.created_at else None
        }

    def mark_as_read(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> None:
        notification = self.repo.get_user_notification(notification_id, user_id)
        if not notification:
            raise NotFoundError(f"Notification {notification_id} not found")

        notification.read = True
        self.repo.session.commit()

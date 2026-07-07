from app.core.repositories.base import BaseRepository
import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.entities.notification import WebNotification


class WebNotificationsRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def get(self, notification_id: uuid.UUID) -> WebNotification | None:
        stmt = select(WebNotification).where(WebNotification.id == notification_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_user_notification(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> WebNotification | None:
        stmt = select(WebNotification).where(
            WebNotification.id == notification_id,
            or_(WebNotification.user_id == user_id, WebNotification.user_id.is_(None))
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def list_by_user(self, user_id: uuid.UUID) -> list[WebNotification]:
        stmt = select(WebNotification).where(
            or_(WebNotification.user_id == user_id, WebNotification.user_id.is_(None))
        )
        stmt = stmt.order_by(WebNotification.created_at.desc())
        return list(self.session.execute(stmt).scalars().all())

    def save(self, notification: WebNotification) -> WebNotification:
        self.session.add(notification)
        self.session.flush()
        return notification

    def delete(self, notification: WebNotification) -> None:
        self.session.delete(notification)
        self.session.flush()

import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.entities.base import Base, TimestampMixin, UUIDMixin


class WebNotification(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "web_notifications"
    __table_args__ = {"schema": "notification"}

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("system.users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String, default="info")  # info, warning, error, success
    read: Mapped[bool] = mapped_column(Boolean, default=False)

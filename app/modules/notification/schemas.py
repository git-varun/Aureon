"""Notification schemas."""
from pydantic import BaseModel
from datetime import datetime


class NotificationBase(BaseModel):
    title: str
    message: str
    type: str = "info"


class NotificationCreate(NotificationBase):
    user_id: int


class NotificationResponse(NotificationBase):
    id: int
    user_id: int
    read: bool
    created_at: datetime

    class Config:
        from_attributes = True
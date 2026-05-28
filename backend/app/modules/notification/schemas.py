"""Notification schemas."""
from pydantic import BaseModel, ConfigDict, Field, model_validator
from datetime import datetime
from typing import Optional


class NotificationBase(BaseModel):
    title: str
    message: str
    type: str = "info"


class NotificationCreate(NotificationBase):
    pass


class NotificationResponse(BaseModel):
    """Response schema with FE-compatible field names (kind, is_read)."""

    id: int
    user_id: int
    title: str
    message: str
    kind: str = "info"
    is_read: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def _map_db_fields(cls, data: object) -> object:
        """Map ORM field names (type, read) to FE field names (kind, is_read)."""
        if hasattr(data, "__dict__"):
            return {
                "id": data.id,
                "user_id": data.user_id,
                "title": data.title,
                "message": data.message,
                "kind": getattr(data, "type", "info"),
                "is_read": getattr(data, "read", False),
                "created_at": data.created_at,
            }
        if isinstance(data, dict):
            mapped = dict(data)
            if "type" in mapped and "kind" not in mapped:
                mapped["kind"] = mapped.pop("type")
            if "read" in mapped and "is_read" not in mapped:
                mapped["is_read"] = mapped.pop("read")
            return mapped
        return data

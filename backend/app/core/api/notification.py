import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict

from app.api.dependencies import get_current_user, get_notification_service
from app.core.exceptions import NotFoundError
from app.core.entities.system import User
from app.core.services.notification import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])

class NotificationCreate(BaseModel):
    title: str
    message: str
    type: Optional[str] = "info"

class NotificationResponse(BaseModel):
    id: str
    title: str
    message: str
    type: str
    read: bool
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

@router.get("/", response_model=List[NotificationResponse])
def get_notifications(
    user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service)
):
    return service.get_notifications_by_user(user.id)

@router.post("/", response_model=NotificationResponse)
def create_notification(
    notification: NotificationCreate,
    user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service)
):
    data = {
        "user_id": user.id,
        "title": notification.title,
        "message": notification.message,
        "type": notification.type
    }
    return service.create_notification(data)

@router.put("/{notification_id}/read")
def mark_as_read(
    notification_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service)
):
    try:
        service.mark_as_read(notification_id, user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"message": "Notification marked as read"}

@router.put("/mark-all-read")
def mark_all_read(
    ids: List[uuid.UUID],
    user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service)
):
    for notification_id in ids:
        try:
            service.mark_as_read(notification_id, user.id)
        except NotFoundError:
            pass
    return {"message": f"{len(ids)} notifications marked as read"}

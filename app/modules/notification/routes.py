"""Notification routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.db import get_session
from app.core.dependencies import require_auth
from app.modules.notification.models import Notification
from app.modules.notification.schemas import NotificationCreate, NotificationResponse
from app.modules.notification.services import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("/", response_model=List[NotificationResponse])
def get_notifications(db: Session = Depends(get_session), _user=Depends(require_auth)):
    service = NotificationService(db)
    return service.get_notifications_by_user(_user.id)

@router.post("/", response_model=NotificationResponse)
def create_notification(notification: NotificationCreate, db: Session = Depends(get_session),
                        _user=Depends(require_auth)):
    service = NotificationService(db)
    return service.create_notification(notification.dict())

@router.put("/{notification_id}/read")
def mark_as_read(notification_id: int, db: Session = Depends(get_session), _user=Depends(require_auth)):
    service = NotificationService(db)
    service.mark_as_read(notification_id)
    return {"message": "Notification marked as read"}
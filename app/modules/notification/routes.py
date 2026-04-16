"""Notification routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.db import get_session
from app.modules.notification.models import Notification
from app.modules.notification.schemas import NotificationCreate, NotificationResponse
from app.modules.notification.services import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("/", response_model=List[NotificationResponse])
def get_notifications(user_id: int, db: Session = Depends(get_session)):
    service = NotificationService(db)
    return service.get_notifications_by_user(user_id)

@router.post("/", response_model=NotificationResponse)
def create_notification(notification: NotificationCreate, db: Session = Depends(get_session)):
    service = NotificationService(db)
    return service.create_notification(notification.dict())

@router.put("/{notification_id}/read")
def mark_as_read(notification_id: int, db: Session = Depends(get_session)):
    service = NotificationService(db)
    service.mark_as_read(notification_id)
    return {"message": "Notification marked as read"}
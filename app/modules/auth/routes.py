"""Auth routes: register, login, refresh, logout."""
from fastapi import APIRouter, Depends, status

from sqlalchemy.orm import Session
from app.core.dependencies import get_session
from app.modules.auth import services
from app.modules.auth.schemas import (
    RegisterRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
)
from app.shared.exceptions import AppException

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/health")
def auth_health():
    """Health check endpoint."""
    return {"module": "auth", "status": "ok"}


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=dict)
def register(payload: RegisterRequest, db: Session = Depends(get_session)):
    """Register a new user.

    Returns:
        {access_token, refresh_token, token_type, user_id}
    """
    try:
        access, refresh, user_id = services.register_user(payload, db)
        return {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
            "user_id": user_id,
        }
    except AppException:
        raise


@router.post("/login", response_model=dict)
def login(payload: LoginRequest, db: Session = Depends(get_session)):
    """Login user.

    Returns:
        {access_token, refresh_token, token_type, user_id}
    """
    try:
        access, refresh, user_id = services.login_user(payload, db)
        return {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
            "user_id": user_id,
        }
    except AppException:
        raise


@router.post("/refresh", response_model=dict)
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_session)):
    """Refresh access token.

    Returns:
        {access_token, token_type}
    """
    try:
        access = services.refresh_access_token(payload.refresh_token, db)
        return {"access_token": access, "token_type": "bearer"}
    except AppException:
        raise


@router.post("/logout")
def logout(payload: LogoutRequest, db: Session = Depends(get_session)):
    """Logout user (invalidate refresh token).

    Returns:
        {status: "logged_out"}
    """
    services.logout_user(payload.refresh_token, db)
    return {"status": "logged_out", "message": "Successfully logged out"}

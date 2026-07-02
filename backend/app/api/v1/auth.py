from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_auth_service,
    get_current_session,
    get_current_user,
    get_db,
    get_users_repo,
)
from app.core.rate_limit import check_auth_rate_limit
from app.api.v1.schemas import (
    AuthResponse,
    GoogleAuthRequest,
    LoginRequest,
    RegisterRequest,
    UserResponse,
)
from app.core.security import hash_password, verify_password
from app.domain.entities.system import User, UserSession
from app.domain.services.auth import AuthService

router = APIRouter()

# Bare (non-/auth-prefixed) account routes, mounted separately at /api/v1
users_router = APIRouter()

@users_router.delete("/users/me")
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_user.is_active = False
    db.add(current_user)
    db.commit()
    return {"status": "success", "message": "Account deactivated"}

@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> AuthResponse:
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    check_auth_rate_limit(f"register:{payload.email.lower()}", max_attempts=5, window_seconds=300)

    session, user = auth_service.register_with_invite(
        email=payload.email,
        password=payload.password,
        first_name=payload.first_name,
        last_name=payload.last_name,
        invite_token=payload.token,
        ip_address=ip,
        user_agent=user_agent,
    )
    return AuthResponse(session=session, user=user)

@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
    users_repo = Depends(get_users_repo),
) -> AuthResponse:
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    check_auth_rate_limit(f"login:{payload.email.lower()}", max_attempts=5, window_seconds=60)

    # Authenticate and get session
    session = auth_service.login(
        email=payload.email,
        password=payload.password,
        ip_address=ip,
        user_agent=user_agent,
    )
    
    # Retrieve user to form response
    user = users_repo.get_by_id(session.user_id)
    return AuthResponse(session=session, user=user)

@router.post("/google", response_model=AuthResponse)
def google_login(
    payload: GoogleAuthRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> AuthResponse:
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    session, user = auth_service.login_google(
        id_token=payload.id_token,
        ip_address=ip,
        user_agent=user_agent,
    )
    return AuthResponse(session=session, user=user)



class UpdateProfileRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    profile_picture: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@router.post("/logout", status_code=status.HTTP_200_OK)
def logout(
    session: UserSession = Depends(get_current_session),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    auth_service.logout(session.session_token)
    return {"status": "success", "message": "Successfully logged out"}

@router.post("/logout/all", status_code=status.HTTP_200_OK)
def logout_all(
    session: UserSession = Depends(get_current_session),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    auth_service.logout_all(session.user_id)
    return {"status": "success", "message": "All sessions terminated"}

@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user

@router.put("/me", response_model=UserResponse)
def update_me(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> User:
    if payload.first_name is not None:
        current_user.first_name = payload.first_name
    if payload.last_name is not None:
        current_user.last_name = payload.last_name
    if payload.profile_picture is not None:
        current_user.profile_picture = payload.profile_picture
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user

@router.post("/me/password", status_code=status.HTTP_200_OK)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> dict:
    if not current_user.password_hash or not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Invalid current password")
    current_user.password_hash = hash_password(payload.new_password)
    db.add(current_user)
    db.commit()
    return {"status": "success", "message": "Password updated successfully"}


from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.api.dependencies import (
    get_auth_service,
    get_current_session,
    get_current_user,
    get_users_repo,
)
from app.core.exceptions import AuthenticationError
from app.core.rate_limit import check_auth_rate_limit
from app.api.v1.schemas import (
    AuthResponse,
    GoogleAuthRequest,
    LoginRequest,
    RegisterRequest,
    UserResponse,
)
from app.domain.entities.system import User, UserSession
from app.domain.services.auth import AuthService

router = APIRouter()

# Bare (non-/auth-prefixed) account routes, mounted separately at /api/v1
users_router = APIRouter()

@users_router.delete("/users/me")
def delete_account(
    current_user: User = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
):
    auth_service.deactivate_account(current_user)
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
    auth_service: AuthService = Depends(get_auth_service),
) -> User:
    return auth_service.update_profile(
        current_user,
        first_name=payload.first_name,
        last_name=payload.last_name,
        profile_picture=payload.profile_picture,
    )

@router.post("/me/password", status_code=status.HTTP_200_OK)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        auth_service.change_password(current_user, payload.current_password, payload.new_password)
    except AuthenticationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "success", "message": "Password updated successfully"}


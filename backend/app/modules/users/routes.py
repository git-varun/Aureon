"""User routes: profile management."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_session, require_auth
from app.core.security import verify_password, hash_password
from app.modules.users.services import UserService
from app.modules.users.schemas import UserProfileResponse, UserProfileUpdate, UserPasswordUpdate
from app.shared.exceptions import ValidationError

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/health")
def users_health():
    return {"module": "users", "status": "ok"}


@router.get("/me", response_model=UserProfileResponse)
def get_current_user_profile(
        current_user=Depends(require_auth),
        db: Session = Depends(get_session)
):
    """Get authenticated user's profile."""
    service = UserService(db)
    user = service.get_user_by_id(current_user.id)
    return user


@router.put("/me", response_model=UserProfileResponse)
def update_current_user_profile(
        payload: UserProfileUpdate,
        current_user=Depends(require_auth),
        db: Session = Depends(get_session)
):
    """Update authenticated user's profile."""
    service = UserService(db)
    updates = payload.model_dump(exclude_unset=True)
    user = service.update_user(current_user.id, **updates)
    return user


@router.post("/me/password")
def change_password(
        payload: UserPasswordUpdate,
        current_user=Depends(require_auth),
        db: Session = Depends(get_session)
):
    """Change authenticated user's password."""
    service = UserService(db)
    user = service.get_user_by_id(current_user.id)

    # Verify current password
    if not verify_password(payload.current_password, user.password_hash):
        raise ValidationError("Current password is incorrect")

    # Update to new password
    new_hash = hash_password(payload.new_password)
    service.update_user(current_user.id, password_hash=new_hash)

    return {"status": "password_updated"}

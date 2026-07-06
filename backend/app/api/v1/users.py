from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, serialize_user_profile
from app.core.database import get_db
from app.domain.entities.system import User, UserPreference

router = APIRouter(prefix="/users", tags=["users"])


class UpdateProfileRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    risk_profile: Optional[str] = None
    working_area: Optional[str] = None
    target_profit_pct: Optional[float] = None
    monthly_saving: Optional[float] = None
    swing_trading_enabled: Optional[bool] = None


@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return serialize_user_profile(current_user, db)


@router.put("/me")
def update_me(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    user_fields = payload.model_dump(include={"first_name", "last_name", "phone"}, exclude_none=True)
    for field, value in user_fields.items():
        setattr(current_user, field, value)

    pref = db.query(UserPreference).filter(UserPreference.user_id == current_user.id).first()
    if not pref:
        pref = UserPreference(user_id=current_user.id)
        db.add(pref)

    pref_fields = payload.model_dump(
        include={"bio", "risk_profile", "working_area", "target_profit_pct", "monthly_saving", "swing_trading_enabled"},
        exclude_none=True,
    )
    for field, value in pref_fields.items():
        setattr(pref, field, value)

    db.commit()
    return serialize_user_profile(current_user, db)

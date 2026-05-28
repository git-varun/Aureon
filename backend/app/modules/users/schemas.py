"""User request/response schemas."""
import re
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

_E164_RE = re.compile(r"^\+[1-9]\d{6,14}$")


class UserProfileResponse(BaseModel):
    """User profile data (without sensitive fields)."""
    id: int
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    profile_picture: Optional[str] = None
    is_active: bool = True
    is_verified: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    # Extended investment profile
    risk_profile: Optional[str] = None
    working_area: Optional[str] = None
    target_profit_pct: Optional[float] = None
    monthly_saving: Optional[float] = None
    swing_trading_enabled: bool = False

    model_config = ConfigDict(from_attributes=True)

    @field_validator('is_active', 'is_verified', 'swing_trading_enabled', mode='before')
    @classmethod
    def coerce_bool(cls, v):
        return bool(v) if v is not None else False


class UserProfileUpdate(BaseModel):
    """Update user profile fields."""
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    phone: Optional[str] = None
    bio: Optional[str] = Field(None, max_length=500)
    profile_picture: Optional[str] = None
    # Extended investment profile
    risk_profile: Optional[str] = Field(None, pattern='^(conservative|moderate|balanced|aggressive|speculative)$')
    working_area: Optional[str] = Field(None, max_length=200)
    target_profit_pct: Optional[float] = Field(None, ge=0, le=1000)
    monthly_saving: Optional[float] = Field(None, ge=0)
    swing_trading_enabled: Optional[bool] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _E164_RE.match(v):
            raise ValueError("phone must be in E.164 format, e.g. +919876543210")
        return v


class UserPasswordUpdate(BaseModel):
    """Update user password."""
    current_password: str = Field(..., min_length=6)
    new_password: str = Field(..., min_length=8)

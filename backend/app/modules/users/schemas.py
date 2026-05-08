"""User request/response schemas."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class UserProfileResponse(BaseModel):
    """User profile data (without sensitive fields)."""
    id: int
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    profile_picture: Optional[str] = None
    is_active: bool
    is_verified: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UserProfileUpdate(BaseModel):
    """Update user profile fields."""
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    phone: Optional[str] = Field(None, min_length=5, max_length=20)
    bio: Optional[str] = Field(None, max_length=500)
    profile_picture: Optional[str] = None


class UserPasswordUpdate(BaseModel):
    """Update user password."""
    current_password: str = Field(..., min_length=6)
    new_password: str = Field(..., min_length=8)

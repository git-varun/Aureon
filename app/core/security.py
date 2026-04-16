"""Security helpers for auth modules."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt

from app.core.config import settings


def create_access_token(subject: str, expires_minutes: Optional[int] = None) -> str:
    """Create JWT access token."""
    exp_minutes = expires_minutes or settings.access_token_expire_minutes
    expire_at = datetime.now(timezone.utc) + timedelta(minutes=exp_minutes)
    payload = {"sub": subject, "exp": expire_at}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)

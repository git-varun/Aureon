from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt

from app.core.config import settings
from app.core.exceptions import AuthenticationError


def create_access_token(subject: str, expires_minutes: Optional[int] = None) -> str:
    """Generate a JWT access token."""
    exp_minutes = expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    expire_at = datetime.now(timezone.utc) + timedelta(minutes=exp_minutes)
    payload = {"sub": subject, "exp": expire_at}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def verify_access_token(token: str) -> str:
    """Verify a JWT access token and return its subject (user ID)."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        subject = payload.get("sub")
        if not subject:
            raise AuthenticationError("Invalid token: sub missing")
        return str(subject)
    except jwt.PyJWTError as e:
        raise AuthenticationError(f"Invalid or expired token: {e}")

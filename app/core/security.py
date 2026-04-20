"""Security helpers for auth modules."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_access_token(subject: str, expires_minutes: Optional[int] = None) -> str:
    """Create JWT access token."""
    exp_minutes = expires_minutes or settings.access_token_expire_minutes
    expire_at = datetime.now(timezone.utc) + timedelta(minutes=exp_minutes)
    payload = {"sub": subject, "exp": expire_at}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def hash_password(password: str) -> str:
    """Hash a plain password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain password against its hash."""
    return pwd_context.verify(plain, hashed)

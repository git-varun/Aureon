"""Auth business logic: register, login, token refresh, logout."""
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.modules.auth.models import Token
from app.modules.auth.schemas import LoginRequest, RegisterRequest
from app.modules.users.models import User
from app.shared.exceptions import ConflictError, ValidationError


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


def _create_refresh_token(user_id: int, db: Session) -> str:
    raw = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=30)
    db.add(Token(user_id=user_id, token=raw, token_type="refresh", expires_at=expires))
    db.commit()
    return raw


def register_user(req: RegisterRequest, db: Session) -> tuple[str, str, int]:
    if db.query(User).filter_by(email=req.email).first():
        raise ConflictError("Email already registered")
    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        first_name=req.first_name,
        last_name=req.last_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    access = create_access_token(str(user.id))
    refresh = _create_refresh_token(user.id, db)
    return access, refresh, user.id


def login_user(req: LoginRequest, db: Session) -> tuple[str, str, int]:
    user = db.query(User).filter_by(email=req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise ValidationError("Invalid credentials")
    if not user.is_active:
        raise ValidationError("Account inactive")
    access = create_access_token(str(user.id))
    refresh = _create_refresh_token(user.id, db)
    return access, refresh, user.id


def refresh_access_token(refresh_token: str, db: Session) -> str:
    record = db.query(Token).filter_by(token=refresh_token, token_type="refresh").first()
    if not record:
        raise ValidationError("Invalid refresh token")
    if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        db.delete(record)
        db.commit()
        raise ValidationError("Refresh token expired")
    return create_access_token(str(record.user_id))


def logout_user(refresh_token: str, db: Session) -> None:
    record = db.query(Token).filter_by(token=refresh_token, token_type="refresh").first()
    if record:
        db.delete(record)
        db.commit()

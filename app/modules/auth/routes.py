"""Auth routes: register, login, refresh, logout."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_session
from app.modules.auth.models import Token
from app.modules.users.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)

# ── Request / Response schemas ────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    first_name: str = ""
    last_name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    import bcrypt
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


def _create_jwt(user_id: int) -> str:
    import jwt
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def _decode_jwt(token: str) -> dict:
    import jwt
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])


def _store_refresh_token(user_id: int, db: Session) -> str:
    import secrets
    raw = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=30)
    db.add(Token(user_id=user_id, token=raw, token_type="refresh", expires_at=expires))
    db.commit()
    return raw


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/health")
def auth_health():
    return {"module": "auth", "status": "ok"}


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_session)):
    if db.query(User).filter_by(email=payload.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        email=payload.email,
        password_hash=_hash_password(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    access = _create_jwt(user.id)
    refresh = _store_refresh_token(user.id, db)
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_session)):
    user = db.query(User).filter_by(email=payload.email).first()
    if not user or not _verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account inactive")
    access = _create_jwt(user.id)
    refresh = _store_refresh_token(user.id, db)
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}


@router.post("/refresh")
def refresh_token(refresh: str, db: Session = Depends(get_session)):
    record = db.query(Token).filter_by(token=refresh, token_type="refresh").first()
    if not record:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=401, detail="Refresh token expired")
    access = _create_jwt(record.user_id)
    return {"access_token": access, "token_type": "bearer"}


@router.post("/logout")
def logout(refresh: str, db: Session = Depends(get_session)):
    record = db.query(Token).filter_by(token=refresh, token_type="refresh").first()
    if record:
        db.delete(record)
        db.commit()
    return {"status": "logged_out"}

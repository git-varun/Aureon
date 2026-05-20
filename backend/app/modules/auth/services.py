"""Auth business logic: all authentication methods."""
import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.modules.auth.models import MagicToken, OtpCode, Token
from app.modules.auth.schemas import (
    LoginRequest,
    RegisterRequest,
)
from app.modules.users.models import User
from app.shared.exceptions import ConflictError, ValidationError

logger = logging.getLogger("app.auth.services")

_OTP_TTL_MINUTES = 10
_MAGIC_TTL_MINUTES = 15
_MAX_OTP_ATTEMPTS = 5


# ── Password helpers ───────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


# ── Token helpers ──────────────────────────────────────────────────────────

def _create_refresh_token(user_id: int, db: Session) -> str:
    raw = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=30)
    db.add(Token(user_id=user_id, token=raw, token_type="refresh", expires_at=expires))
    db.commit()
    return raw


def _get_or_create_user_by_email(email: str, db: Session, **kwargs) -> tuple[User, bool]:
    """Find user by email or create a new one. Returns (user, is_new)."""
    user = db.query(User).filter_by(email=email).first()
    if user:
        return user, False
    user = User(email=email, is_verified=True, **kwargs)
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Auto-created user email=%s", email)
    return user, True


# ── OTP helpers ────────────────────────────────────────────────────────────

def _generate_otp() -> str:
    return str(secrets.randbelow(900000) + 100000)  # 6-digit, never starts with 0


def _hash_code(code: str) -> str:
    from app.core.config import settings
    return hmac.new(settings.secret_key.encode(), code.encode(), hashlib.sha256).hexdigest()


def _verify_code(code: str, stored: str) -> bool:
    return hmac.compare_digest(_hash_code(code), stored)


def _invalidate_existing_otps(identifier: str, purpose: str, db: Session) -> None:
    db.query(OtpCode).filter_by(identifier=identifier, purpose=purpose, used=False).update({"used": True})
    db.commit()


def _send_otp(identifier: str, purpose: str, db: Session) -> None:
    """Generate, store, and deliver an OTP. identifier is email or E.164 phone."""
    _invalidate_existing_otps(identifier, purpose, db)
    code = _generate_otp()
    expires = datetime.now(timezone.utc) + timedelta(minutes=_OTP_TTL_MINUTES)
    db.add(OtpCode(
        identifier=identifier,
        code_hash=_hash_code(code),
        purpose=purpose,
        expires_at=expires,
    ))
    db.commit()

    if purpose == "phone_signin":
        from app.core import sms_service
        sms_service.send_otp(identifier, code)
    else:
        from app.core import email_service
        label = "Your 2FA verification code" if purpose == "password_2fa" else "Your sign-in code"
        email_service.send_otp(identifier, code, label=label)

    logger.info("OTP sent identifier=*** purpose=%s", purpose)


def _verify_otp(identifier: str, code: str, purpose: str, db: Session) -> None:
    """Verify OTP. Raises ValidationError on failure. Marks used on success."""
    record = (
        db.query(OtpCode)
        .filter_by(identifier=identifier, purpose=purpose, used=False)
        .order_by(OtpCode.created_at.desc())
        .first()
    )
    if not record:
        raise ValidationError("No active verification code found. Please request a new one.")

    if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        record.used = True
        db.commit()
        raise ValidationError("Code expired. Please request a new one.")

    record.attempts += 1
    if record.attempts > _MAX_OTP_ATTEMPTS:
        record.used = True
        db.commit()
        raise ValidationError("Too many incorrect attempts. Please request a new code.")

    if not _verify_code(code, record.code_hash):
        db.commit()
        raise ValidationError("Incorrect code.")

    record.used = True
    db.commit()


# ── Existing password auth ─────────────────────────────────────────────────

def register_user(req: RegisterRequest, db: Session) -> tuple[str, str, int]:
    if db.query(User).filter_by(email=req.email).first():
        raise ConflictError("Email already registered")
    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        first_name=req.first_name,
        last_name=req.last_name,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    access = create_access_token(str(user.id))
    refresh = _create_refresh_token(user.id, db)
    return access, refresh, user.id


def login_user(req: LoginRequest, db: Session) -> None:
    """Step 1 of password+OTP login. Validates credentials, sends 2FA OTP.

    Raises ValidationError on bad credentials.
    Returns None — caller must prompt for OTP via /login/verify.
    """
    user = db.query(User).filter_by(email=req.email).first()
    if not user or not user.password_hash or not verify_password(req.password, user.password_hash):
        raise ValidationError("Invalid email or password")
    if not user.is_active:
        raise ValidationError("Account inactive")
    _send_otp(req.email, "password_2fa", db)


def login_verify_otp(email: str, code: str, db: Session) -> tuple[str, str, int]:
    """Step 2 of password+OTP login. Verifies email OTP, returns tokens."""
    _verify_otp(email, code, "password_2fa", db)
    user = db.query(User).filter_by(email=email).first()
    if not user or not user.is_active:
        raise ValidationError("Account not found or inactive")
    access = create_access_token(str(user.id))
    refresh = _create_refresh_token(user.id, db)
    return access, refresh, user.id


def refresh_access_token(refresh_token: str, db: Session) -> tuple[str, str]:
    record = db.query(Token).filter_by(token=refresh_token, token_type="refresh").first()
    if not record:
        raise ValidationError("Invalid refresh token")
    if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        db.delete(record)
        db.commit()
        raise ValidationError("Refresh token expired")
    user_id = record.user_id
    db.delete(record)
    db.flush()
    new_access = create_access_token(str(user_id))
    new_refresh = _create_refresh_token(user_id, db)
    return new_access, new_refresh


def logout_user(refresh_token: str, db: Session) -> None:
    record = db.query(Token).filter_by(token=refresh_token, token_type="refresh").first()
    if record:
        db.delete(record)
        db.commit()


# ── Magic link ─────────────────────────────────────────────────────────────

def magic_send(email: str, db: Session, base_url: str = "http://localhost:5173") -> None:
    """Generate a magic token and email the sign-in link."""
    # Invalidate any existing unused tokens for this email
    db.query(MagicToken).filter_by(email=email, used=False).update({"used": True})
    db.commit()

    raw = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(minutes=_MAGIC_TTL_MINUTES)

    user = db.query(User).filter_by(email=email).first()
    db.add(MagicToken(
        token=raw,
        email=email,
        user_id=user.id if user else None,
        expires_at=expires,
    ))
    db.commit()

    link = f"{base_url}/#magic_token={raw}"
    from app.core import email_service
    email_service.send_magic_link(email, link)
    logger.info("Magic link sent email=*** expires_in=%dm", _MAGIC_TTL_MINUTES)


def magic_verify(token: str, db: Session) -> tuple[str, str, int, bool]:
    """Consume a magic token and return (access, refresh, user_id, is_new_user)."""
    record = db.query(MagicToken).filter_by(token=token, used=False).first()
    if not record:
        raise ValidationError("Invalid or already-used magic link")
    if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        record.used = True
        db.commit()
        raise ValidationError("Magic link expired. Please request a new one.")

    record.used = True
    db.commit()

    user, is_new = _get_or_create_user_by_email(record.email, db)
    access = create_access_token(str(user.id))
    refresh = _create_refresh_token(user.id, db)
    return access, refresh, user.id, is_new


# ── Email OTP ──────────────────────────────────────────────────────────────

def email_otp_send(email: str, db: Session) -> None:
    _send_otp(email, "email_signin", db)


def email_otp_verify(email: str, code: str, db: Session) -> tuple[str, str, int, bool]:
    _verify_otp(email, code, "email_signin", db)
    user, is_new = _get_or_create_user_by_email(email, db)
    access = create_access_token(str(user.id))
    refresh = _create_refresh_token(user.id, db)
    return access, refresh, user.id, is_new


# ── Phone OTP ──────────────────────────────────────────────────────────────

def phone_otp_send(phone: str, db: Session) -> None:
    _send_otp(phone, "phone_signin", db)


def phone_otp_verify(phone: str, code: str, db: Session) -> tuple[str, str, int, bool]:
    _verify_otp(phone, code, "phone_signin", db)
    # Find by phone; create if not found
    user = db.query(User).filter_by(phone=phone).first()
    is_new = False
    if not user:
        user = User(phone=phone, email=f"phone_{phone.lstrip('+').replace(' ', '')}@aureon.internal",
                    is_verified=True)
        db.add(user)
        db.commit()
        db.refresh(user)
        is_new = True
        logger.info("Auto-created phone user phone=***")
    access = create_access_token(str(user.id))
    refresh = _create_refresh_token(user.id, db)
    return access, refresh, user.id, is_new


# ── Google OAuth ───────────────────────────────────────────────────────────

def google_auth(id_token: str, db: Session) -> tuple[str, str, int, bool]:
    """Verify Google token, find/create user, return tokens."""
    from app.core.google_auth import verify_google_token
    profile = verify_google_token(id_token)

    # Try by google_id first, then by email
    user = db.query(User).filter_by(google_id=profile["google_id"]).first()
    is_new = False
    if not user:
        user = db.query(User).filter_by(email=profile["email"]).first()
        if user:
            # Link google_id to existing account
            user.google_id = profile["google_id"]
            if not user.profile_picture and profile.get("picture"):
                user.profile_picture = profile["picture"]
            db.commit()
        else:
            name_parts = profile.get("name", "").split(" ", 1)
            user = User(
                email=profile["email"],
                google_id=profile["google_id"],
                first_name=name_parts[0] if name_parts else "",
                last_name=name_parts[1] if len(name_parts) > 1 else "",
                profile_picture=profile.get("picture"),
                is_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            is_new = True
            logger.info("Auto-created Google user email=***")

    access = create_access_token(str(user.id))
    refresh = _create_refresh_token(user.id, db)
    return access, refresh, user.id, is_new

"""Auth models: Token, OtpCode, MagicToken."""
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from app.core.db import Base
from app.modules.users.models import User  # noqa: F401 — canonical User model


class Token(Base):
    __tablename__ = "tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    token_type = Column(String, default="refresh")  # refresh or access
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class OtpCode(Base):
    """One-time password codes for email and phone authentication.

    `identifier` is the email address or E.164 phone number.
    `purpose`    is one of: "email_signin" | "phone_signin" | "password_2fa"
    `attempts`   is incremented on each failed verify; locked at 5.
    """
    __tablename__ = "otp_codes"

    id = Column(Integer, primary_key=True, index=True)
    identifier = Column(String, nullable=False, index=True)
    code_hash = Column(String, nullable=False)
    purpose = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class MagicToken(Base):
    """Single-use tokens delivered via email magic links.

    Only the HMAC-SHA256 hash of the token is stored — the plaintext is sent
    to the user's email and never persisted, so a DB read yields nothing usable.
    """
    __tablename__ = "magic_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token_hash = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

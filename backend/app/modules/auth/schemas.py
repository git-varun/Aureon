"""Auth request/response schemas."""
import re
from pydantic import BaseModel, EmailStr, field_validator

_E164_RE = re.compile(r"^\+[1-9]\d{6,14}$")


# ── Existing password auth ─────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str = ""
    last_name: str = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LogoutRequest(BaseModel):
    refresh_token: str


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Magic link ─────────────────────────────────────────────────────────────

class MagicSendRequest(BaseModel):
    email: EmailStr


class MagicVerifyRequest(BaseModel):
    token: str


# ── Email OTP ──────────────────────────────────────────────────────────────

class EmailOtpSendRequest(BaseModel):
    email: EmailStr


class EmailOtpVerifyRequest(BaseModel):
    email: EmailStr
    code: str


# ── Phone OTP ──────────────────────────────────────────────────────────────

class PhoneOtpSendRequest(BaseModel):
    phone: str  # E.164 format e.g. +919876543210

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not _E164_RE.match(v):
            raise ValueError("phone must be in E.164 format, e.g. +919876543210")
        return v


class PhoneOtpVerifyRequest(BaseModel):
    phone: str
    code: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not _E164_RE.match(v):
            raise ValueError("phone must be in E.164 format, e.g. +919876543210")
        return v


# ── Google OAuth ───────────────────────────────────────────────────────────

class GoogleAuthRequest(BaseModel):
    id_token: str


# ── Password + email OTP 2FA ───────────────────────────────────────────────

class PasswordLoginVerifyRequest(BaseModel):
    email: EmailStr
    code: str


# ── Responses ──────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int
    is_new_user: bool = False


class OtpSentResponse(BaseModel):
    status: str = "sent"


class PasswordOtpPendingResponse(BaseModel):
    status: str = "otp_required"
    message: str = "A verification code has been sent to your email."


class AuthResponse(BaseModel):
    """Generic auth response wrapper."""
    status: str
    message: str
    data: TokenResponse | None = None

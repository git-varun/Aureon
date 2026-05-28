"""Auth routes: all authentication methods."""
from fastapi import APIRouter, Depends, Request, status

from sqlalchemy.orm import Session
from app.core.dependencies import get_session
from app.core.limiter import limiter
from app.modules.auth import services
from app.modules.auth.schemas import (
    RegisterRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    MagicSendRequest,
    MagicVerifyRequest,
    EmailOtpSendRequest,
    EmailOtpVerifyRequest,
    PhoneOtpSendRequest,
    PhoneOtpVerifyRequest,
    GoogleAuthRequest,
    PasswordLoginVerifyRequest,
    TokenResponse,
    OtpSentResponse,
    PasswordOtpPendingResponse,
)
from app.core.config import settings
from app.shared.exceptions import AppException, ValidationError

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_resp(access: str, refresh: str, user_id: int, is_new: bool = False) -> dict:
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "user_id": user_id,
        "is_new_user": is_new,
    }


@router.get("/health")
def auth_health():
    return {"module": "auth", "status": "ok"}


# ── Existing password auth ─────────────────────────────────────────────────

@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, payload: RegisterRequest, db: Session = Depends(get_session)):
    """Register a new account with email + password."""
    try:
        access, refresh, user_id = services.register_user(payload, db)
        return _token_resp(access, refresh, user_id, is_new=True)
    except AppException:
        raise


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_session)):
    """Step 1: validate email + password, send 2FA OTP to email.

    On success returns { status: "otp_required" }. Client must call /login/verify.
    """
    try:
        services.login_user(payload, db)
        return PasswordOtpPendingResponse()
    except AppException:
        raise


@router.post("/login/verify")
@limiter.limit("10/minute")
def login_verify(request: Request, payload: PasswordLoginVerifyRequest, db: Session = Depends(get_session)):
    """Step 2: verify the email OTP sent after password validation."""
    try:
        access, refresh, user_id = services.login_verify_otp(payload.email, payload.code, db)
        return _token_resp(access, refresh, user_id)
    except AppException:
        raise


@router.post("/refresh")
@limiter.limit("20/minute")
def refresh_token(request: Request, payload: RefreshRequest, db: Session = Depends(get_session)):
    try:
        access, refresh = services.refresh_access_token(payload.refresh_token, db)
        return {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}
    except AppException:
        raise


@router.post("/logout")
def logout(payload: LogoutRequest, db: Session = Depends(get_session)):
    services.logout_user(payload.refresh_token, db)
    return {"status": "logged_out", "message": "Successfully logged out"}


# ── Magic link ─────────────────────────────────────────────────────────────

@router.post("/magic/send")
@limiter.limit("5/minute")
def magic_send(request: Request, payload: MagicSendRequest, db: Session = Depends(get_session)):
    """Send a magic sign-in link to the given email."""
    try:
        services.magic_send(payload.email, db)
        return OtpSentResponse()
    except AppException:
        raise


@router.post("/magic/verify")
@limiter.limit("20/minute")
def magic_verify(request: Request, payload: MagicVerifyRequest, db: Session = Depends(get_session)):
    """Consume a magic link token and return JWT credentials."""
    try:
        access, refresh, user_id, is_new = services.magic_verify(payload.token, db)
        return _token_resp(access, refresh, user_id, is_new)
    except AppException:
        raise


# ── Email OTP ──────────────────────────────────────────────────────────────

@router.post("/otp/email/send")
@limiter.limit("3/minute")
def email_otp_send(request: Request, payload: EmailOtpSendRequest, db: Session = Depends(get_session)):
    """Send a 6-digit OTP to the given email address."""
    try:
        services.email_otp_send(payload.email, db)
        return OtpSentResponse()
    except AppException:
        raise


@router.post("/otp/email/verify")
@limiter.limit("10/minute")
def email_otp_verify(request: Request, payload: EmailOtpVerifyRequest, db: Session = Depends(get_session)):
    """Verify email OTP and return JWT credentials."""
    try:
        access, refresh, user_id, is_new = services.email_otp_verify(payload.email, payload.code, db)
        return _token_resp(access, refresh, user_id, is_new)
    except AppException:
        raise


# ── Phone OTP ──────────────────────────────────────────────────────────────

@router.post("/otp/phone/send")
@limiter.limit("3/minute")
def phone_otp_send(request: Request, payload: PhoneOtpSendRequest, db: Session = Depends(get_session)):
    """Send a 6-digit OTP via SMS to the given E.164 phone number."""
    try:
        services.phone_otp_send(payload.phone, db)
        return OtpSentResponse()
    except AppException:
        raise


@router.post("/otp/phone/verify")
@limiter.limit("10/minute")
def phone_otp_verify(request: Request, payload: PhoneOtpVerifyRequest, db: Session = Depends(get_session)):
    """Verify phone OTP and return JWT credentials."""
    try:
        access, refresh, user_id, is_new = services.phone_otp_verify(payload.phone, payload.code, db)
        return _token_resp(access, refresh, user_id, is_new)
    except AppException:
        raise


# ── Dev-only direct login (no OTP) ─────────────────────────────────────────

@router.post("/dev-login")
def dev_login(payload: LoginRequest, db: Session = Depends(get_session)):
    """Return tokens directly without OTP — only available when ENABLE_API_DOCS=true."""
    if not settings.enable_api_docs:
        raise ValidationError("Not available in production")
    access, refresh, user_id = services.dev_login(payload.email, payload.password, db)
    return _token_resp(access, refresh, user_id)


# ── Google OAuth ───────────────────────────────────────────────────────────

@router.post("/google")
@limiter.limit("10/minute")
def google_auth(request: Request, payload: GoogleAuthRequest, db: Session = Depends(get_session)):
    """Verify a Google ID token and return JWT credentials."""
    try:
        access, refresh, user_id, is_new = services.google_auth(payload.id_token, db)
        return _token_resp(access, refresh, user_id, is_new)
    except AppException:
        raise

from app.core.config import settings
from app.core.exceptions import AuthenticationError, ValidationError
from app.core.logging import logger

def verify_google_token(id_token: str) -> dict:
    """Verify a Google ID token and return the parsed profile.

    Returns:
        {google_id, email, name, picture, email_verified}
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise ValidationError("Google OAuth is not configured (GOOGLE_CLIENT_ID missing)")

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
        
        payload = google_id_token.verify_oauth2_token(
            id_token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except Exception as exc:
        logger.warning(f"Google token verification failed: {exc}")
        raise AuthenticationError("Invalid or expired Google token")

    if not payload.get("email_verified"):
        raise ValidationError("Google account email is not verified")

    return {
        "google_id": payload["sub"],
        "email": payload["email"],
        "name": payload.get("name", ""),
        "picture": payload.get("picture"),
        "email_verified": payload.get("email_verified", False),
    }

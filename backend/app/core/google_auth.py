"""Google OAuth ID-token verification.

Verifies a Google-issued id_token using Google's public keys.
Requires GOOGLE_CLIENT_ID in settings.

Returns a dict with: email, name, google_id (sub), picture (optional).
Raises ConfigError if GOOGLE_CLIENT_ID is not set.
Raises ValidationError if the token is invalid or expired.
"""
import logging

logger = logging.getLogger("app.core.google_auth")


def verify_google_token(id_token: str) -> dict:
    """Verify a Google ID token and return the parsed profile.

    Returns:
        {google_id, email, name, picture, email_verified}
    """
    from app.core.config import settings
    from app.shared.exceptions import ConfigError, ValidationError

    if not settings.google_client_id:
        raise ConfigError("Google OAuth is not configured (GOOGLE_CLIENT_ID missing)")

    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        payload = google_id_token.verify_oauth2_token(
            id_token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ImportError:
        raise ConfigError("google-auth package is not installed — run: pip install google-auth")
    except Exception as exc:
        logger.warning("Google token verification failed: %s", exc)
        raise ValidationError("Invalid or expired Google token")

    if not payload.get("email_verified"):
        raise ValidationError("Google account email is not verified")

    return {
        "google_id": payload["sub"],
        "email": payload["email"],
        "name": payload.get("name", ""),
        "picture": payload.get("picture"),
        "email_verified": payload.get("email_verified", False),
    }

import re
from typing import Any

# Secrets this system masks: passwords, JWTs, refresh/access tokens, API secrets,
# private keys. Everything else (SQL, request/response bodies, business data,
# emails, IDs) is logged in full — visibility is the point of this system.
SENSITIVE_KEYS = {
    "password", "passwd", "secret", "api_key", "apikey", "secret_key",
    "private_key", "access_token", "refresh_token", "token", "authorization",
}

_JWT = re.compile(r"ey[a-zA-Z0-9-_]+\.ey[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+")
_BEARER = re.compile(r"Bearer\s+[a-zA-Z0-9-._~+/]+=*")
_KEY_VAL_SECRET = re.compile(
    r"(?i)(" + "|".join(SENSITIVE_KEYS) + r")\s*[:=]\s*\"?([^\s\",}]+)\"?"
)
# Sensitive query-string parameter names (e.g. Gemini's ?key=<api_key>)
_URL_QUERY_SECRET = re.compile(
    r"(?i)([?&](?:key|api_key|apikey|token|secret|signature|checksum)=)[^&\s]+"
)


class Sanitizer:
    """Redacts credentials/secrets from strings, dicts, and URLs before logging."""

    @staticmethod
    def sanitize_string(text: str) -> str:
        if not text:
            return text
        text = _JWT.sub("[REDACTED_JWT]", text)
        text = _BEARER.sub("Bearer [REDACTED_TOKEN]", text)
        text = _KEY_VAL_SECRET.sub(lambda m: f"{m.group(1)}: [REDACTED_SECRET]", text)
        return text

    @staticmethod
    def sanitize_url(url: str) -> str:
        return _URL_QUERY_SECRET.sub(lambda m: f"{m.group(1)}[REDACTED_SECRET]", url)

    @staticmethod
    def sanitize_data(data: Any) -> Any:
        if isinstance(data, dict):
            return {
                k: "[REDACTED_SECRET]" if k.lower() in SENSITIVE_KEYS else Sanitizer.sanitize_data(v)
                for k, v in data.items()
            }
        if isinstance(data, (list, tuple)):
            return [Sanitizer.sanitize_data(x) for x in data]
        if isinstance(data, str):
            return Sanitizer.sanitize_string(data)
        return data

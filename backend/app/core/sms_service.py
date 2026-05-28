"""SMS delivery — provider priority: Fast2SMS → Textbelt → dev log.

Fast2SMS:   set FAST2SMS_API_KEY (works with Indian numbers, free tier available)
Textbelt:   set TEXTBELT_API_KEY ("textbelt" = 1 SMS/day US-only free tier)
Dev mode:   if neither key is set, OTP is printed to the logger (no SMS sent)
"""
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request

logger = logging.getLogger("app.core.sms_service")

_DIGITS_RE = re.compile(r"\D")


def _strip_country_code(e164: str) -> str:
    """Return the subscriber number without the leading + and country code.

    Fast2SMS requires a 10-digit Indian number. For +91XXXXXXXXXX strip +91.
    For any other country code, strip everything before the last 10 digits.
    """
    digits = _DIGITS_RE.sub("", e164)  # e.g. "919876543210"
    return digits[-10:]


def _send_fast2sms(to: str, body: str, api_key: str) -> None:
    number = _strip_country_code(to)
    payload = urllib.parse.urlencode({
        "authorization": api_key,
        "route": "q",
        "numbers": number,
        "message": body,
        "flash": "0",
    }).encode()
    req = urllib.request.Request(
        "https://www.fast2sms.com/dev/bulkV2",
        data=payload,
        method="POST",
    )
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode(errors="replace")
        logger.error("Fast2SMS HTTP %s to=%s body=%s", exc.code, to, error_body)
        raise RuntimeError(f"Fast2SMS HTTP {exc.code}: {error_body}") from exc

    if not result.get("return"):
        logger.error("Fast2SMS rejected SMS to=%s response=%s", to, result)
        raise RuntimeError(f"Fast2SMS error: {result.get('message') or result}")

    logger.info("SMS sent via Fast2SMS to=%s", to)


def _send_textbelt(to: str, body: str, api_key: str, url: str) -> None:
    data = urllib.parse.urlencode({
        "phone": to,
        "message": body,
        "key": api_key,
    }).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req, timeout=10) as resp:
        result = json.loads(resp.read().decode())

    if not result.get("success"):
        logger.error("Textbelt rejected SMS to=%s response=%s", to, result)
        raise RuntimeError(f"Textbelt error: {result.get('error') or result}")

    logger.info("SMS sent via Textbelt to=%s quota_remaining=%s", to, result.get("quotaRemaining"))


def send_otp(to: str, code: str) -> None:
    """Send a 6-digit OTP via SMS to the given E.164 phone number."""
    from app.core.config import settings

    body = f"Your Aureon sign-in code is {code}. Valid for 10 minutes. Do not share it."

    if settings.fast2sms_api_key:
        _send_fast2sms(to, body, settings.fast2sms_api_key)
    elif settings.textbelt_api_key:
        _send_textbelt(to, body, settings.textbelt_api_key, settings.textbelt_url)
    else:
        logger.warning("[DEV] No SMS provider configured — OTP for %s: %s", to, code)

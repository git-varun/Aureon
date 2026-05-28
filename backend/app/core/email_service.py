"""Email delivery service.

Sends transactional emails (OTP codes, magic links) via SMTP.
Dev-mode fallback: if SMTP_HOST is not configured, the content is printed
to the logger instead so the app remains fully functional without an SMTP server.
"""
import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger("app.core.email_service")

_OTP_HTML = """\
<!DOCTYPE html>
<html>
<body style="background:#0B0D10;color:#E4E7ED;font-family:sans-serif;padding:40px 0;margin:0;">
  <div style="max-width:480px;margin:0 auto;background:#13151a;border:1px solid rgba(255,255,255,0.07);
              border-radius:12px;padding:36px 32px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px;">
      <svg width="22" height="22" viewBox="0 0 48 48">
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#E7D3A1"/><stop offset="1" stop-color="#B4924F"/>
        </linearGradient></defs>
        <path d="M24 6 L40 40 L33 40 L24 20 L15 40 L8 40 Z" fill="url(#g)"/>
      </svg>
      <span style="font-size:18px;font-weight:600;color:#E4E7ED;letter-spacing:-0.01em;">Aureon</span>
    </div>
    <div style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;
                color:#C9A86A;font-weight:600;margin-bottom:10px;">{label}</div>
    <div style="font-family:monospace;font-size:36px;font-weight:700;letter-spacing:0.18em;
                color:#E4E7ED;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);
                border-radius:8px;padding:18px 0;text-align:center;margin:18px 0;">{code}</div>
    <div style="font-size:13px;color:#8B8F9A;line-height:1.6;">
      This code expires in <strong style="color:#E4E7ED;">{expiry}</strong>.<br>
      If you didn't request this, you can safely ignore it.
    </div>
    <div style="margin-top:28px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.06);
                font-size:11px;color:#555;text-align:center;">
      SEBI · RIA-ready &nbsp;·&nbsp; © 2026 Aureon &nbsp;·&nbsp; Do not reply to this email
    </div>
  </div>
</body>
</html>
"""

_MAGIC_HTML = """\
<!DOCTYPE html>
<html>
<body style="background:#0B0D10;color:#E4E7ED;font-family:sans-serif;padding:40px 0;margin:0;">
  <div style="max-width:480px;margin:0 auto;background:#13151a;border:1px solid rgba(255,255,255,0.07);
              border-radius:12px;padding:36px 32px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px;">
      <svg width="22" height="22" viewBox="0 0 48 48">
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#E7D3A1"/><stop offset="1" stop-color="#B4924F"/>
        </linearGradient></defs>
        <path d="M24 6 L40 40 L33 40 L24 20 L15 40 L8 40 Z" fill="url(#g)"/>
      </svg>
      <span style="font-size:18px;font-weight:600;color:#E4E7ED;letter-spacing:-0.01em;">Aureon</span>
    </div>
    <div style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;
                color:#C9A86A;font-weight:600;margin-bottom:10px;">Sign in link</div>
    <div style="font-size:15px;color:#E4E7ED;margin-bottom:22px;line-height:1.55;">
      Click the button below to sign in to Aureon. This link is valid for <strong>15 minutes</strong>
      and can only be used once.
    </div>
    <a href="{link}" style="display:block;text-align:center;padding:14px 0;border-radius:8px;
       background:linear-gradient(180deg,#E7D3A1 0%,#C9A86A 100%);color:#1A1410;
       font-size:14px;font-weight:600;text-decoration:none;letter-spacing:-0.005em;">
      Sign in to Aureon →
    </a>
    <div style="margin-top:18px;font-size:12px;color:#8B8F9A;">
      Or copy this link into your browser:<br>
      <span style="font-family:monospace;font-size:11px;color:#C9A86A;word-break:break-all;">{link}</span>
    </div>
    <div style="margin-top:28px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.06);
                font-size:11px;color:#555;text-align:center;">
      SEBI · RIA-ready &nbsp;·&nbsp; © 2026 Aureon &nbsp;·&nbsp; Do not reply to this email
    </div>
  </div>
</body>
</html>
"""


def _build_message(to: str, subject: str, html: str, from_addr: str) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Aureon <{from_addr}>"
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))
    return msg


def _smtp_send(to: str, subject: str, html: str) -> None:
    from app.core.config import settings
    if not settings.smtp_host:
        logger.warning(
            "[DEV] SMTP not configured — would send to %s | subject: %s | body snippet: %.120s",
            to, subject, html.replace("\n", " "),
        )
        return
    context = ssl.create_default_context()
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.ehlo()
        server.starttls(context=context)
        if settings.smtp_user and settings.smtp_password:
            server.login(settings.smtp_user, settings.smtp_password)
        msg = _build_message(to, subject, html, settings.smtp_from)
        server.sendmail(settings.smtp_from, to, msg.as_string())
    logger.info("Email sent to=%s subject=%s", to, subject)


def send_otp(to: str, code: str, expiry: str = "10 minutes", label: str = "Your sign-in code") -> None:
    html = _OTP_HTML.format(label=label, code=code, expiry=expiry)
    _smtp_send(to, f"Aureon: {code} is your sign-in code", html)


def send_magic_link(to: str, link: str) -> None:
    html = _MAGIC_HTML.format(link=link)
    _smtp_send(to, "Sign in to Aureon", html)

import re
from typing import Any, Dict, List, Union

# Centralized sensitive regex patterns
SENSITIVE_PATTERNS = {
    "email": re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"),
    "credit_card": re.compile(r"\b(?:\d[ -]*?){13,16}\b"),
    "jwt": re.compile(r"ey[a-zA-Z0-9-_]+\.ey[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+"),
    "bearer": re.compile(r"Bearer\s+[a-zA-Z0-9-._~+/]+=*"),
    "key_val_secret": re.compile(r"(?i)(password|secret|passwd|token|api_key|apikey|private_key|secret_key|authorization|cookie|cvv)\s*[:=]\s*\"?([^\s\",}]+)\"?"),
}

class Sanitizer:
    """Utility to redact credentials, secrets, tokens, and PII from execution logs."""
    @staticmethod
    def sanitize_string(text: str) -> str:
        if not text:
            return text
            
        # Redact known structures
        text = SENSITIVE_PATTERNS["jwt"].sub("[REDACTED_JWT]", text)
        text = SENSITIVE_PATTERNS["bearer"].sub("Bearer [REDACTED_TOKEN]", text)
        text = SENSITIVE_PATTERNS["credit_card"].sub("[REDACTED_CC]", text)
        text = SENSITIVE_PATTERNS["email"].sub("[REDACTED_EMAIL]", text)
        
        # Redact key-value secrets
        def redact_secret(match):
            key = match.group(1)
            return f"{key}: [REDACTED_SECRET]"
        text = SENSITIVE_PATTERNS["key_val_secret"].sub(redact_secret, text)
        return text

    @staticmethod
    def sanitize_data(data: Any) -> Any:
        if isinstance(data, dict):
            return {
                k: "[REDACTED_SECRET]" if k.lower() in [
                    "password", "secret", "passwd", "token", "api_key", "apikey", 
                    "private_key", "secret_key", "authorization", "cookie", "cvv"
                ] else Sanitizer.sanitize_data(v)
                for k, v in data.items()
            }
        elif isinstance(data, list):
            return [Sanitizer.sanitize_data(x) for x in data]
        elif isinstance(data, str):
            return Sanitizer.sanitize_string(data)
        return data

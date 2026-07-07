from typing import Any, List

from app.core.exceptions import ConfigurationError, RateLimitError
from app.core.logging.http import http_client
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import AIProvider
from app.core.providers.registry import registry

MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]


class GroqProvider(AIProvider):
    def __init__(self):
        self._api_key: str | None = None

    @property
    def provider_name(self) -> str:
        return "groq"

    def capabilities(self) -> List[Capability]:
        return [Capability.AI_CHAT]

    def authenticate(self, api_key: str | None = None, **_: str) -> None:
        if api_key:
            self._api_key = api_key

    def health_check(self) -> bool:
        return bool(self._api_key)

    def fetch(self, prompt: str, *, json_mode: bool = False, model: str | None = None, **kwargs: Any) -> str:
        if not self._api_key:
            raise ConfigurationError("Groq API key is not configured")
        model = model or MODELS[0]

        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
        }
        resp = http_client.httpx_post("Groq", url, json=payload, headers=headers, timeout=60.0)
        if resp.status_code == 429:
            raise RateLimitError(f"Groq model {model} rate limited", retry_after_seconds=60.0)
        resp.raise_for_status()

        data = resp.json()
        return data["choices"][0]["message"]["content"]


registry.register(GroqProvider)

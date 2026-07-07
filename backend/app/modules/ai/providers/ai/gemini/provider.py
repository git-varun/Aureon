from typing import Any, List

from app.core.exceptions import ConfigurationError, RateLimitError
from app.core.logging.http import http_client
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import AIProvider
from app.core.providers.registry import registry

MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]


class GeminiProvider(AIProvider):
    def __init__(self):
        self._api_key: str | None = None

    @property
    def provider_name(self) -> str:
        return "gemini"

    def capabilities(self) -> List[Capability]:
        return [Capability.AI_CHAT]

    def authenticate(self, api_key: str | None = None, **_: str) -> None:
        if api_key:
            self._api_key = api_key

    def health_check(self) -> bool:
        return bool(self._api_key)

    def fetch(self, prompt: str, *, json_mode: bool = False, model: str | None = None, **kwargs: Any) -> str:
        if not self._api_key:
            raise ConfigurationError("Gemini API key is not configured")
        model = model or MODELS[0]

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self._api_key}"
        headers = {"Content-Type": "application/json"}
        config: dict[str, Any] = {}
        if json_mode:
            config["responseMimeType"] = "application/json"

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": config,
        }

        resp = http_client.httpx_post("Gemini", url, json=payload, headers=headers, timeout=60.0)
        if resp.status_code == 429:
            raise RateLimitError(f"Gemini model {model} rate limited", retry_after_seconds=60.0)
        resp.raise_for_status()

        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


registry.register(GeminiProvider)

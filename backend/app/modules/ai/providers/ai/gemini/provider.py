from typing import Any, List

from app.core.exceptions import ConfigurationError, RateLimitError
from app.core.logging.http import http_client
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import AIProvider
from app.core.providers.registry import registry

MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.6-flash"]


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
        if not self._api_key:
            return False
        try:
            res = http_client.get(
                "Gemini", "https://generativelanguage.googleapis.com/v1beta/models",
                params={"key": self._api_key, "pageSize": 1}, timeout=5
            )
            return res.status_code == 200
        except Exception:
            return False

    def fetch(self, prompt: str, *, json_mode: bool = False, model: str | None = None, **kwargs: Any) -> tuple[str, dict[str, int | None]]:
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
        usage = data.get("usageMetadata") or {}
        return data["candidates"][0]["content"]["parts"][0]["text"], {
            "prompt_tokens": usage.get("promptTokenCount"),
            "completion_tokens": usage.get("candidatesTokenCount"),
            "total_tokens": usage.get("totalTokenCount"),
        }


registry.register(GeminiProvider)

"""Multi-model, multi-provider AI service with rate-limit fallback.

Provider chain: Gemini (4 models) → Groq (2 models)
On 429 for a model, that model is cooled-down and the next is tried automatically.
"""

import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

import httpx
from google import genai
from google.genai import errors as genai_errors

from app.core.cache import cache
from app.shared.interfaces import AIModel

logger = logging.getLogger("analytics.ai")

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

_GLOBAL_BRIEFING_PROMPT = """\
Role: Elite Multi-Strategy Portfolio Manager.
Objective: Perform 3-tier analysis (Macro, Fundamental, Technical) on the ENTIRE portfolio.
Position sizing rule: CRITICAL — use the provided Qty to give exact numbers (e.g. "SELL 50% / 45 shares" or "HOLD all 90 shares").
Directive count rule: CRITICAL — generate directives for the Top 15 assets by value. The "directives" array MUST contain exactly 15 objects.

Respond with ONLY valid JSON (no markdown, no extra text) using exactly these keys:
{{
  "market_vibe": "<2-sentence Global Market Pulse>",
  "macro_analysis": "<Deep analysis of sector contagion and macro impacts>",
  "global_score": <float 0.0-1.0 overall market health>,
  "confidence_score": <float 0.0-1.0 confidence in this briefing>,
  "future_projections": {{
    "estimated_30d_trend": "<Bullish / Bearish / Sideways / Volatile>",
    "portfolio_risk_level": "<LOW | MEDIUM | MEDIUM-HIGH | HIGH | EXTREME>",
    "catalyst_watch": "<Specific upcoming global event to watch>"
  }},
  "directives": [
    {{
      "symbol": "<exact ticker symbol from portfolio>",
      "action": "<BUY | SELL | HOLD | AVG DOWN | TAKE PARTIAL PROFIT>",
      "conviction_level": <integer 1-5>,
      "financial_impact": "<expected return or risk in % over timeframe>",
      "position_sizing": "<exact explicit instructions based on Qty Owned>",
      "time_horizon": "<Short-Term | Medium-Term | Long-Term>",
      "risk_reward_ratio": "<e.g. 1:2, 1:3>",
      "technical_analysis": "<explicit RSI, MACD, and Bollinger Band status>",
      "fundamental_analysis": "<explicit P/E, 52w distance, and financial health>",
      "news_sentiment": {{
        "bias": "<Bullish | Bearish | Neutral>",
        "confidence": <integer 0-100>,
        "impact_summary": "<how this specific news moves the asset>"
      }},
      "the_why": "<high-conviction paragraph justifying the action>"
    }}
  ],
  "skipped_assets_summary": "<list tickers skipped and why>"
}}

Portfolio context:
{context}
"""

_SINGLE_ASSET_PROMPT = """\
Role: Elite Proprietary Trader.
Objective: Perform a highly detailed, laser-focused analysis on this single asset.

Respond with ONLY valid JSON (no markdown, no extra text) using exactly these keys:
{{
  "short_term_trend": "<Bullish | Bearish | Neutral>",
  "key_catalyst": "<the main driver moving this asset based on the news>",
  "support_resistance": "<estimate support/resistance based on ATR, Bollinger Bands, and 52w high/low>",
  "recommended_action": "<BUY | SELL | HOLD | AVG DOWN>",
  "position_sizing": "<exact explicit instructions based on Qty Owned>",
  "deep_reasoning": "<a thick, professional paragraph explaining the structural market setup>"
}}

Asset context:
{context}
"""

_NEWS_SENTIMENT_PROMPT = """\
You are a financial news analyst. Analyse the news articles listed below and respond with
ONLY valid JSON (no markdown, no extra text) using exactly these keys:
{{
  "overall_sentiment": <float between -1.0 and 1.0>,
  "article_sentiments": [
    {{"url": "<url>", "sentiment": <float -1.0 to 1.0>, "summary": "<one sentence>"}}
  ]
}}

Articles:
{articles}
"""

# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _parse_json(text: str) -> dict:
    """Extract and parse the first JSON object from a model response string."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def _parse_retry_delay(exc: Exception, default: float = 60.0) -> float:
    """Best-effort extraction of retry delay seconds from a 429 error message."""
    msg = str(exc)
    # Matches "Please retry in 3.27s" or "retryDelay: '3s'"
    m = re.search(r"retry[^\d]*(\d+(?:\.\d+)?)\s*s", msg, re.IGNORECASE)
    if m:
        return float(m.group(1)) + 5.0   # small buffer
    return default


# ---------------------------------------------------------------------------
# Rate-limit tracker
# ---------------------------------------------------------------------------

class _RateLimitTracker:
    """Tracks per-key cooldown — Redis-backed when available, in-process fallback."""

    def __init__(self):
        self._limits: dict[str, float] = {}

    def mark(self, key: str, cooldown_seconds: float) -> None:
        logger.warning("rate-limit: %s cooling down for %.0fs", key, cooldown_seconds)
        if cache.client is not None:
            try:
                cache.client.set(f"ratelimit:{key}", "1", ex=int(cooldown_seconds))
                return
            except Exception:
                pass
        self._limits[key] = time.monotonic() + cooldown_seconds

    def is_limited(self, key: str) -> bool:
        if cache.client is not None:
            try:
                return bool(cache.client.exists(f"ratelimit:{key}"))
            except Exception:
                pass
        expiry = self._limits.get(key)
        if expiry is None:
            return False
        if time.monotonic() >= expiry:
            del self._limits[key]
            return False
        return True

    def available_keys(self, keys: list[str]) -> list[str]:
        return [k for k in keys if not self.is_limited(k)]


# Module-level tracker shared across all provider instances
_tracker = _RateLimitTracker()


# ---------------------------------------------------------------------------
# Gemini provider
# ---------------------------------------------------------------------------

_GEMINI_MODELS = [
    # "gemini-2.5-flash",
    # "gemini-2.5-pro",
    # "gemini-2.0-flash",
    # "gemini-2.0-flash-lite",
    "gemini-3.1-flash-lite-preview",
]


class GeminiAIService(AIModel):
    """Gemini provider — rotates through models on 429."""

    def __init__(self, api_key: str = ""):
        self._client = genai.Client(api_key=api_key)
        logger.info("GeminiAIService: ready with %d models: %s", len(_GEMINI_MODELS), _GEMINI_MODELS)

    def _generate(self, prompt: str) -> str | None:
        available = _tracker.available_keys(_GEMINI_MODELS)
        if not available:
            raise RuntimeError("All Gemini models are currently rate-limited")

        last_exc: Exception | None = None
        for model in available:
            try:
                logger.debug("Gemini: trying model=%s", model)
                response = self._client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config={"response_mime_type": "application/json"},
                )
                logger.info("Gemini: success via model=%s", model)
                return response.text
            except genai_errors.ClientError as exc:
                if exc.code == 429:
                    delay = _parse_retry_delay(exc)
                    _tracker.mark(f"gemini:{model}", delay)
                    logger.warning("Gemini: 429 on %s — trying next model", model)
                    last_exc = exc
                elif exc.code == 404:
                    logger.warning("Gemini: 404 on %s (model unavailable) — trying next model", model)
                    last_exc = exc
                elif exc.code == 503:
                    logger.warning("Gemini: 503 on %s (overloaded) — trying next model", model)
                    last_exc = exc
                else:
                    raise
            except Exception as exc:
                logger.debug("Gemini: non-rate-limit error on %s: %s", model, exc)
                raise

        raise RuntimeError(f"All Gemini models exhausted. Last error: {last_exc}")

    # AIModel interface — delegate to _generate
    def analyze_briefing(self, context: str) -> Optional[Dict[str, Any]]:
        prompt = _GLOBAL_BRIEFING_PROMPT.format(context=context)
        text = self._generate(prompt)
        return _parse_json(text)

    def analyze_single_asset(self, context: str) -> Dict[str, Any]:
        prompt = _SINGLE_ASSET_PROMPT.format(context=context)
        text = self._generate(prompt)
        return _parse_json(text)

    def analyze_news_batch(self, articles: List[dict]) -> Dict[str, Any]:
        articles_text = "\n".join(
            f"- [{a.get('url', '')}] {a.get('title', '')} — {a.get('content') or a.get('summary', '')}"
            for a in articles
        )
        prompt = _NEWS_SENTIMENT_PROMPT.format(articles=articles_text)
        text = self._generate(prompt)
        return _parse_json(text)


# ---------------------------------------------------------------------------
# Groq provider (OpenAI-compatible REST, no extra package required)
# ---------------------------------------------------------------------------

_GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
]

_GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions"
_GROQ_TIMEOUT = 30.0


class GroqAIService(AIModel):
    """Groq provider — free tier, llama models, httpx REST calls."""

    def __init__(self, api_key: str = ""):
        self._api_key = api_key
        logger.info("GroqAIService: ready with %d models: %s", len(_GROQ_MODELS), _GROQ_MODELS)

    def _generate(self, prompt: str) -> str:
        if not self._api_key:
            raise RuntimeError("Groq API key not configured (set GROQ_API_KEY)")

        available = _tracker.available_keys([f"groq:{m}" for m in _GROQ_MODELS])
        if not available:
            raise RuntimeError("All Groq models are currently rate-limited")

        last_exc: Exception | None = None
        for model_key in available:
            model = model_key.removeprefix("groq:")
            try:
                logger.debug("Groq: trying model=%s", model)
                resp = httpx.post(
                    _GROQ_BASE_URL,
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.7,
                    },
                    timeout=_GROQ_TIMEOUT,
                )
                if resp.status_code == 429:
                    delay = _parse_retry_delay(Exception(resp.text))
                    _tracker.mark(model_key, delay)
                    logger.warning("Groq: 429 on %s — trying next model", model)
                    last_exc = Exception(f"429 from Groq: {resp.text[:200]}")
                    continue
                resp.raise_for_status()
                text = resp.json()["choices"][0]["message"]["content"]
                logger.info("Groq: success via model=%s", model)
                return text
            except httpx.HTTPStatusError as exc:
                logger.debug("Groq: HTTP error on %s: %s", model, exc)
                last_exc = exc
            except Exception as exc:
                logger.debug("Groq: error on %s: %s", model, exc)
                last_exc = exc

        raise RuntimeError(f"All Groq models exhausted. Last error: {last_exc}")

    def analyze_briefing(self, context: str) -> Optional[Dict[str, Any]]:
        prompt = _GLOBAL_BRIEFING_PROMPT.format(context=context)
        text = self._generate(prompt)
        return _parse_json(text)

    def analyze_single_asset(self, context: str) -> Dict[str, Any]:
        prompt = _SINGLE_ASSET_PROMPT.format(context=context)
        text = self._generate(prompt)
        return _parse_json(text)

    def analyze_news_batch(self, articles: List[dict]) -> Dict[str, Any]:
        articles_text = "\n".join(
            f"- [{a.get('url', '')}] {a.get('title', '')} — {a.get('content') or a.get('summary', '')}"
            for a in articles
        )
        prompt = _NEWS_SENTIMENT_PROMPT.format(articles=articles_text)
        text = self._generate(prompt)
        return _parse_json(text)


# ---------------------------------------------------------------------------
# Multi-provider orchestrator
# ---------------------------------------------------------------------------

class MultiProviderAIService(AIModel):
    """Tries providers in order; moves to next on any failure."""

    def __init__(self, providers: List[AIModel]):
        self._providers = providers
        names = [type(p).__name__ for p in providers]
        logger.info("MultiProviderAIService: provider chain=%s", names)

    def _run(self, method: str, **kwargs) -> Dict[str, Any]:
        last_exc: Exception | None = None
        for provider in self._providers:
            name = type(provider).__name__
            try:
                result = getattr(provider, method)(**kwargs)
                logger.info("MultiProviderAIService: %s succeeded via %s", method, name)
                return result
            except Exception as exc:
                logger.warning("MultiProviderAIService: %s failed on %s — %s", method, name, exc)
                last_exc = exc

        error_msg = str(last_exc) if last_exc else "all providers failed"
        logger.error("MultiProviderAIService: all providers exhausted for %s", method)
        return {"error": error_msg}

    def analyze_briefing(self, context: str) -> Optional[Dict[str, Any]]:
        logger.info("analyze_briefing: context_chars=%d", len(context))
        return self._run("analyze_briefing", context=context)

    def analyze_single_asset(self, context: str) -> Dict[str, Any]:
        logger.info("analyze_single_asset: context_chars=%d", len(context))
        return self._run("analyze_single_asset", context=context)

    def analyze_news_batch(self, articles: List[dict]) -> Dict[str, Any]:
        logger.info("analyze_news_batch: article_count=%d", len(articles))
        return self._run("analyze_news_batch", articles=articles)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def build_ai_service(cred_manager) -> AIModel:
    """Build the multi-provider AI service using DB-backed credentials."""

    providers: List[AIModel] = []

    gemini_key = cred_manager.get_gemini_key()
    groq_key = cred_manager.get_groq_key()

    logger.info("build_ai_service: GEMINI_API_KEY=%s, GROQ_API_KEY=%s",
                "set" if gemini_key else "not set",
                "set" if groq_key else "not set")

    if gemini_key and cred_manager.is_provider_enabled("gemini"):
        providers.append(GeminiAIService(api_key=gemini_key))
    else:
        logger.warning("build_ai_service: Gemini skipped (key=%s enabled=%s)",
                       "set" if gemini_key else "not set",
                       cred_manager.is_provider_enabled("gemini"))

    if groq_key and cred_manager.is_provider_enabled("groq"):
        providers.append(GroqAIService(api_key=groq_key))
    else:
        logger.info("build_ai_service: Groq skipped (key=%s enabled=%s)",
                    "set" if groq_key else "not set",
                    cred_manager.is_provider_enabled("groq"))

    if not providers:
        raise RuntimeError("No AI providers configured. Set GEMINI_API_KEY or GROQ_API_KEY in provider settings.")

    if len(providers) == 1:
        return providers[0]

    return MultiProviderAIService(providers)

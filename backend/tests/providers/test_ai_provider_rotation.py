"""Exercises AIService.execute_completion through the REAL provider path
(GeminiProvider/GroqProvider -> ProviderFactory -> registry), not the
AUREON_TEST_MOCK_AI escape hatch used by tests/test_ai_financial_assistant.py.
Covers: credential resolution via ConfigService, the model-rotation loop,
and the RateLimitError -> CircuitBreaker cooldown/fallback path.
"""
import os
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.core.database import SessionLocal, engine
from app.domain.entities.base import Base
from app.domain.entities.config import ProviderConfig
from app.domain.services.ai import AIService


@pytest.fixture(autouse=True)
def ensure_real_path():
    # This file must NOT run through the mock branch.
    os.environ.pop("AUREON_TEST_MOCK_AI", None)
    yield
    os.environ.pop("AUREON_TEST_MOCK_AI", None)


@pytest.fixture
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def reset_provider_credentials():
    # Providers are registry singletons — clear credentials after each test so
    # a fake key set here can't leak into other test modules.
    yield
    from app.core.providers.registry import registry
    for name in ("gemini", "groq"):
        p = registry.get(name)
        if p is not None:
            p._api_key = None


def _seed_gemini_key(db_session, api_key: str = "fake-gemini-key") -> None:
    cfg = ProviderConfig(
        provider_name="gemini",
        provider_type="ai",
        key_names='["api_key"]',
        status="ACTIVE",
        capabilities='["AI_CHAT"]',
        enabled=True,
    )
    db_session.add(cfg)
    db_session.commit()

    from app.domain.services.config import ConfigService
    from app.infrastructure.repositories.config import ConfigRepository
    ConfigService(ConfigRepository(db_session)).set_provider_key("gemini", "api_key", api_key)


def test_execute_completion_uses_real_gemini_provider(clean_db, db_session):
    _seed_gemini_key(db_session)

    fake_response = MagicMock()
    fake_response.status_code = 200
    fake_response.raise_for_status.return_value = None
    fake_response.json.return_value = {
        "candidates": [{"content": {"parts": [{"text": '{"ok": true}'}]}}]
    }

    with patch("app.infrastructure.providers.ai.gemini.provider.httpx.post", return_value=fake_response) as mock_post:
        svc = AIService(db_session)
        result = svc.execute_completion(prompt="hello", feature_name="ask_aureon", json_mode=True)

    assert result == '{"ok": true}'
    assert mock_post.called
    assert "generativelanguage.googleapis.com" in mock_post.call_args[0][0]

    from app.domain.entities.ai import AIGeneration
    gen = db_session.query(AIGeneration).filter_by(feature_name="ask_aureon").first()
    assert gen is not None
    assert gen.provider == "gemini"
    assert gen.model == "gemini-2.5-flash"


def test_execute_completion_falls_back_past_rate_limited_model(clean_db, db_session):
    _seed_gemini_key(db_session)

    rate_limited = MagicMock()
    rate_limited.status_code = 429

    ok_response = MagicMock()
    ok_response.status_code = 200
    ok_response.raise_for_status.return_value = None
    ok_response.json.return_value = {
        "candidates": [{"content": {"parts": [{"text": "fallback worked"}]}}]
    }

    with patch(
        "app.infrastructure.providers.ai.gemini.provider.httpx.post",
        side_effect=[rate_limited, ok_response],
    ):
        svc = AIService(db_session)
        result = svc.execute_completion(prompt="hello", feature_name="ask_aureon", json_mode=False)

    assert result == "fallback worked"


def test_execute_completion_raises_when_no_credentials(clean_db, db_session):
    from app.core.exceptions import ProviderError

    svc = AIService(db_session)
    with pytest.raises(ProviderError):
        svc.execute_completion(prompt="hello", feature_name="ask_aureon")

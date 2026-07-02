from datetime import timezone
from unittest.mock import MagicMock, patch

import pytest

from app.domain.services.providers.models import NormalizedNews, NormalizedQuote
from app.infrastructure.providers.yahoo import YahooAdapter, _parse_yahoo_news_item


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

CURRENT_PAYLOAD = {
    "id": "abc123",
    "content": {
        "title": "Apple hits new high",
        "pubDate": "2024-06-01T10:30:00Z",
        "canonicalUrl": {"url": "https://example.com/apple-high"},
        "summary": "Apple shares reached an all-time high.",
    },
}

LEGACY_PAYLOAD = {
    "title": "Apple quarterly results",
    "link": "https://example.com/apple-q2",
    "providerPublishTime": 1717228800,  # 2024-06-01 08:00:00 UTC
}

MALFORMED_PAYLOAD_MISSING_TITLE = {
    "content": {
        "pubDate": "2024-06-01T10:30:00Z",
        "canonicalUrl": {"url": "https://example.com/no-title"},
    }
}

MALFORMED_PAYLOAD_MISSING_URL = {
    "content": {
        "title": "No URL article",
        "pubDate": "2024-06-01T10:30:00Z",
    }
}

PAYLOAD_MISSING_TIMESTAMP = {
    "content": {
        "title": "Article without timestamp",
        "canonicalUrl": {"url": "https://example.com/no-ts"},
    }
}

PAYLOAD_INVALID_TIMESTAMP = {
    "content": {
        "title": "Article with bad timestamp",
        "pubDate": "not-a-date",
        "canonicalUrl": {"url": "https://example.com/bad-ts"},
    }
}


# ---------------------------------------------------------------------------
# _parse_news_item unit tests
# ---------------------------------------------------------------------------

@pytest.fixture
def adapter():
    return YahooAdapter()


def test_parse_current_payload(adapter):
    result = _parse_yahoo_news_item(CURRENT_PAYLOAD, "yahoo")
    assert result is not None
    assert result.title == "Apple hits new high"
    assert result.url == "https://example.com/apple-high"
    assert result.published_at.tzinfo is not None
    assert result.published_at.year == 2024
    assert result.provider == "yahoo"


def test_parse_legacy_payload(adapter):
    result = _parse_yahoo_news_item(LEGACY_PAYLOAD, "yahoo")
    assert result is not None
    assert result.title == "Apple quarterly results"
    assert result.url == "https://example.com/apple-q2"
    assert result.published_at.tzinfo == timezone.utc
    assert result.published_at.year == 2024


def test_parse_malformed_missing_title_returns_none(adapter):
    assert _parse_yahoo_news_item(MALFORMED_PAYLOAD_MISSING_TITLE, "yahoo") is None


def test_parse_malformed_missing_url_returns_none(adapter):
    assert _parse_yahoo_news_item(MALFORMED_PAYLOAD_MISSING_URL, "yahoo") is None


def test_parse_missing_timestamp_uses_fallback(adapter):
    result = _parse_yahoo_news_item(PAYLOAD_MISSING_TIMESTAMP, "yahoo")
    assert result is not None
    assert result.published_at is not None


def test_parse_invalid_timestamp_uses_fallback(adapter):
    result = _parse_yahoo_news_item(PAYLOAD_INVALID_TIMESTAMP, "yahoo")
    assert result is not None
    assert result.published_at is not None


# ---------------------------------------------------------------------------
# get_news integration tests (no network)
# ---------------------------------------------------------------------------

def _make_ticker_mock(news_items):
    mock_ticker = MagicMock()
    mock_ticker.news = news_items
    return mock_ticker


def test_get_news_current_format(adapter):
    with patch("yfinance.Ticker", return_value=_make_ticker_mock([CURRENT_PAYLOAD])):
        results = adapter.get_news("AAPL")
    assert len(results) == 1
    assert isinstance(results[0], NormalizedNews)
    assert results[0].title == "Apple hits new high"


def test_get_news_legacy_format(adapter):
    with patch("yfinance.Ticker", return_value=_make_ticker_mock([LEGACY_PAYLOAD])):
        results = adapter.get_news("AAPL")
    assert len(results) == 1
    assert results[0].url == "https://example.com/apple-q2"


def test_get_news_mixed_formats(adapter):
    items = [CURRENT_PAYLOAD, LEGACY_PAYLOAD]
    with patch("yfinance.Ticker", return_value=_make_ticker_mock(items)):
        results = adapter.get_news("AAPL")
    assert len(results) == 2


def test_get_news_skips_malformed_items(adapter):
    items = [CURRENT_PAYLOAD, MALFORMED_PAYLOAD_MISSING_TITLE, MALFORMED_PAYLOAD_MISSING_URL]
    with patch("yfinance.Ticker", return_value=_make_ticker_mock(items)):
        results = adapter.get_news("AAPL")
    assert len(results) == 1


def test_get_news_empty_returns_empty_list(adapter):
    with patch("yfinance.Ticker", return_value=_make_ticker_mock([])):
        results = adapter.get_news("AAPL")
    assert results == []


def test_get_news_exception_returns_empty_list(adapter):
    mock_ticker = MagicMock()
    mock_ticker.news = MagicMock(side_effect=RuntimeError("network error"))
    with patch("yfinance.Ticker", return_value=mock_ticker):
        results = adapter.get_news("AAPL")
    assert results == []


# ---------------------------------------------------------------------------
# Quote test (existing, kept)
# ---------------------------------------------------------------------------

def test_yahoo_quote_normalization() -> None:
    adapter = YahooAdapter()
    quote = adapter.get_quote("AAPL")

    assert isinstance(quote, NormalizedQuote)
    assert quote.symbol == "AAPL"
    assert quote.provider == "yahoo"
    assert quote.price is not None

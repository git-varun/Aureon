"""Standard provider interfaces.

Every concrete provider implements exactly one of the capability-specific ABCs
below (which all extend ProviderProtocol). Adding a new provider means:
implement one of these interfaces in a new folder under
`app/infrastructure/providers/<category>/<name>/`, then call
`registry.register(YourProviderClass)`. No other source change is required.

Only MarketDataProvider, NewsProvider, BrokerProvider, and AIProvider have
concrete implementations today (see app/infrastructure/providers/). The rest
exist so future providers have an interface to implement against without
requiring another architecture change — they intentionally have zero
concrete subclasses right now.
"""
from abc import ABC, abstractmethod
from typing import Any, List, Optional, TYPE_CHECKING

from app.core.providers.capabilities import Capability

if TYPE_CHECKING:
    from app.domain.services.providers.models import NormalizedNews, NormalizedQuote


class ProviderProtocol(ABC):
    """Base contract every provider implements, regardless of category."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...

    def initialize(self) -> None:
        """Optional setup hook (open connections, warm caches). Default: no-op."""
        return None

    @abstractmethod
    def health_check(self) -> bool:
        ...

    def authenticate(self, **credentials: Any) -> None:
        """Optional — providers with no auth (e.g. yfinance) leave this a no-op."""
        return None

    @abstractmethod
    def capabilities(self) -> List[Capability]:
        ...

    def metadata(self) -> dict[str, Any]:
        """Free-form descriptive info (rate limits, docs URL, etc.). Default: empty."""
        return {}

    def shutdown(self) -> None:
        """Optional teardown hook. Default: no-op."""
        return None

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        from app.core.logging.instrument import instrument
        provider_label = cls.__name__.removesuffix("Provider").removesuffix("Adapter")
        for attr_name, attr_value in list(cls.__dict__.items()):
            if attr_name.startswith("_") or attr_name in ("provider_name",):
                continue
            if callable(attr_value) and not isinstance(attr_value, (classmethod, staticmethod)):
                setattr(cls, attr_name, instrument("Provider", provider_label)(attr_value))


class MarketDataProvider(ProviderProtocol):
    """PRICE / OHLC / NEWS / FUNDAMENTALS / SEARCH capable providers (Yahoo, Finnhub, Polygon)."""

    @abstractmethod
    def get_quote(self, symbol: str) -> "NormalizedQuote":
        ...

    @abstractmethod
    def get_news(self, symbol: str) -> List["NormalizedNews"]:
        ...

    def get_technical_indicators(self, symbol: str) -> dict[str, Any]:
        """Optional — RSI/MACD/volatility/sentiment derived from historical OHLC + news.
        Only Yahoo implements this today; other providers may leave it unsupported."""
        raise NotImplementedError(f"{self.provider_name} does not support technical indicators")


class NewsProvider(ProviderProtocol):
    """Dedicated news-only providers (NewsAPI, Moneycontrol, RSS — none implemented yet)."""

    @abstractmethod
    def get_news(self, symbol: Optional[str] = None) -> List["NormalizedNews"]:
        ...


class BrokerProvider(ProviderProtocol):
    """PORTFOLIO / TRANSACTIONS / HOLDINGS capable providers (Zerodha; Groww/Binance are
    import-only today and do not implement this interface — see portfolio_importer.py)."""

    @abstractmethod
    def sync(self, **kwargs: Any) -> Any:
        """Fetch current holdings/transactions from the broker."""
        ...

    @abstractmethod
    def validate(self, **kwargs: Any) -> bool:
        """Confirm the stored credentials/session are still usable."""
        ...


class WalletProvider(ProviderProtocol):
    """On-chain wallet providers (MetaMask, etc.) — no implementation yet."""

    @abstractmethod
    def sync(self, address: str) -> Any:
        ...


class AIProvider(ProviderProtocol):
    """AI_CHAT capable providers (Gemini, Groq)."""

    @abstractmethod
    def fetch(self, prompt: str, *, json_mode: bool = False, **kwargs: Any) -> str:
        ...


class EmbeddingProvider(ProviderProtocol):
    """EMBEDDINGS capability — no implementation yet."""

    @abstractmethod
    def fetch(self, text: str, **kwargs: Any) -> List[float]:
        ...


class OCRProvider(ProviderProtocol):
    """OCR capability (e.g. scanned contract notes) — no implementation yet."""

    @abstractmethod
    def fetch(self, document_bytes: bytes, **kwargs: Any) -> str:
        ...


class StorageProvider(ProviderProtocol):
    """Backup/export destinations (Google Drive, OneDrive, Dropbox) — no implementation yet."""

    @abstractmethod
    def sync(self, payload: bytes, destination: str, **kwargs: Any) -> str:
        ...


class NotificationProvider(ProviderProtocol):
    """Outbound notification channels (Telegram, Email, Discord) — no implementation yet.
    The current NotificationService only writes in-app WebNotification rows; it does not
    dispatch through any provider of this type."""

    @abstractmethod
    def fetch(self, message: str, target: str, **kwargs: Any) -> bool:
        ...


class CurrencyProvider(ProviderProtocol):
    """FX rate providers (ExchangeRate API, RBI) — no implementation yet.
    Note: frontend/src/contexts/V4Context.jsx currently calls open.er-api.com directly,
    bypassing the backend entirely; that is a known gap this interface is meant to close."""

    @abstractmethod
    def fetch(self, base: str, quote: str) -> Any:
        ...


class TaxProvider(ProviderProtocol):
    """Capital-gains/tax computation providers — no implementation yet."""

    @abstractmethod
    def fetch(self, **kwargs: Any) -> Any:
        ...


class CalendarProvider(ProviderProtocol):
    """Economic/corporate calendar providers — no implementation yet."""

    @abstractmethod
    def fetch(self, **kwargs: Any) -> Any:
        ...


class RetirementProvider(ProviderProtocol):
    """EPF/NPS accrual providers — no implementation yet."""

    @abstractmethod
    def sync(self, **kwargs: Any) -> Any:
        ...

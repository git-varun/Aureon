"""Provider contracts and payload schemas used across the app modules."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class AssetPayload(BaseModel):
    symbol: str
    qty: float
    source: str
    type: str
    avg_buy_price: float = 0.0
    unrealized_pnl: float = 0.0
    positions: Optional[List[Dict[str, Any]]] = Field(default_factory=list)


class NewsPayload(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    title: str
    snippet: str
    link: str
    provider: str


class TechMetricsPayload(BaseModel):
    momentum_rsi: Optional[float] = None
    trend_strength: Optional[float] = None
    price_risk_pct: Optional[float] = None
    z_score: Optional[float] = None
    macro_tsl: Optional[float] = None
    target_1_2: Optional[float] = None
    bmsb_status: Optional[str] = None
    tv_signal: str = "NEUTRAL"
    suggested_position: Optional[str] = None


class PricePayload(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    symbol: str
    price: float
    currency: Literal["INR", "USD"] = "INR"
    provider: str


class AssetSource(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @abstractmethod
    def validate_credentials(self) -> None:
        """Verify required credentials are present and valid.

        Raise CredentialError (or ValueError) listing every missing variable
        so the caller can fail fast before touching the broker API.
        """
        pass

    @abstractmethod
    def fetch_holdings(self) -> List[AssetPayload]:
        pass


class NewsProvider(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @abstractmethod
    def fetch_headlines(self, symbol: str) -> List[NewsPayload]:
        pass


class PriceProvider(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @abstractmethod
    def get_price(self, symbol: str, asset_type: str) -> Optional[PricePayload]:
        pass


class AIModel(ABC):
    @abstractmethod
    def analyze_briefing(self, context: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def analyze_news_batch(self, articles: list) -> Dict[str, Any]:
        pass

    @abstractmethod
    def analyze_single_asset(self, context: str) -> Dict[str, Any]:
        pass


class SignalPayload(BaseModel):
    """Standardized signal output from any provider."""
    schema_version: Literal["1.0"] = "1.0"
    symbol: str
    action: Literal["BUY", "SELL", "HOLD", "STRONG_BUY", "STRONG_SELL"]
    confidence: float = Field(..., ge=0.0, le=1.0, description="0.0 to 1.0")
    provider: str
    timeframe: str = "short_term"  # short_term, medium_term, long_term
    rationale: Optional[str] = None
    risk_level: Optional[str] = None  # low, medium, high
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None


class SignalProvider(ABC):
    """Base class for signal providers (technical, fundamental, sentiment, etc.)."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Unique name for this provider (e.g., 'technical', 'fundamental', 'sentiment')."""
        pass

    @abstractmethod
    def generate_signal(self, symbol: str, asset_type: str = "equity") -> Optional[SignalPayload]:
        """Generate a signal for a symbol.

        Args:
            symbol: Asset symbol (e.g., 'RELIANCE', 'BTC')
            asset_type: Type of asset ('equity' or 'crypto')

        Returns:
            SignalPayload with signal details, or None if signal cannot be generated
        """
        pass

    @abstractmethod
    def validate_data_availability(self, symbol: str) -> bool:
        """Check if sufficient data is available to generate a reliable signal."""
        pass

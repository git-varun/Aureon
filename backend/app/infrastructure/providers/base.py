from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, List

if TYPE_CHECKING:
    from app.domain.services.providers.models import NormalizedNews, NormalizedQuote

class ProviderAdapter(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @abstractmethod
    def get_quote(self, symbol: str) -> "NormalizedQuote":
        pass

    @abstractmethod
    def get_news(self, symbol: str) -> List["NormalizedNews"]:
        pass

    @abstractmethod
    def health_check(self) -> bool:
        pass

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        from app.core.observability.decorators import instrument_provider
        # Strip "Adapter" suffix so "YahooAdapter" → "Yahoo" in logs
        provider_name = cls.__name__.removesuffix("Adapter")
        for attr_name, attr_value in list(cls.__dict__.items()):
            if attr_name.startswith("_") or attr_name == "provider_name":
                continue
            if callable(attr_value) and not isinstance(attr_value, (classmethod, staticmethod)):
                setattr(cls, attr_name, instrument_provider(provider_name, attr_name)(attr_value))

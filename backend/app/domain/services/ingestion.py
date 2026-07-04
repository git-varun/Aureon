import uuid

from app.domain.services.base import BaseService
from app.domain.services.providers.models import NormalizedQuote
from app.infrastructure.repositories.ingestion import IngestionRepository


class QuoteIngestionService(BaseService):
    def __init__(self, repo: IngestionRepository):
        self.repo = repo

    def save_quote(self, provider_name: str, quote: NormalizedQuote) -> uuid.UUID:
        """Persists a fetched quote and marks the provider healthy. Returns the asset_id."""
        provider = self.repo.get_or_create_provider(provider_name)
        self.repo.track_usage(provider.id, "get_quote")

        asset = self.repo.get_or_create_asset(quote.symbol)
        self.repo.upsert_quote(quote, asset.id)
        self.repo.session.commit()

        try:
            self.repo.mark_provider_healthy(provider)
        except Exception:
            self.repo.session.rollback()

        return asset.id

    def record_failure(self, provider_name: str, symbol: str, error: str) -> None:
        provider = self.repo.get_or_create_provider(provider_name)
        try:
            self.repo.record_failure(provider_name, symbol, error)
            self.repo.mark_provider_degraded(provider)
        except Exception:
            self.repo.session.rollback()

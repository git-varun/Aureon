import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.domain.entities.market import Asset, LatestQuote
from app.domain.entities.system import FailedIngestion, Provider, ProviderUsage
from app.domain.services.providers.models import NormalizedQuote
from app.infrastructure.repositories.base import BaseRepository


class IngestionRepository(BaseRepository):
    def get_or_create_provider(self, provider_name: str) -> Provider:
        provider = self.session.scalar(select(Provider).filter_by(name=provider_name))
        if not provider:
            provider = Provider(name=provider_name)
            self.session.add(provider)
            self.session.commit()
            self.session.refresh(provider)
        return provider

    def track_usage(self, provider_id: uuid.UUID, endpoint: str) -> None:
        self.session.add(ProviderUsage(
            provider_id=provider_id,
            endpoint=endpoint,
            request_count=1,
            recorded_at=datetime.now(timezone.utc)
        ))

    def mark_provider_healthy(self, provider: Provider) -> None:
        self.session.refresh(provider)
        provider.last_success_at = datetime.now(timezone.utc)
        provider.health_status = "healthy"
        self.session.commit()

    def mark_provider_degraded(self, provider: Provider) -> None:
        provider.health_status = "degraded"
        self.session.commit()

    def get_or_create_asset(self, symbol: str) -> Asset:
        asset = self.session.scalar(select(Asset).filter_by(symbol=symbol))
        if not asset:
            asset = Asset(
                id=uuid.uuid5(uuid.NAMESPACE_DNS, symbol),
                symbol=symbol,
                name=symbol,
                asset_class="equity"
            )
            self.session.add(asset)
            self.session.flush()
        return asset

    def upsert_quote(self, quote: NormalizedQuote, asset_id: uuid.UUID) -> None:
        now = datetime.now(timezone.utc)
        stmt = insert(LatestQuote).values(
            symbol=quote.symbol,
            asset_id=asset_id,
            price=quote.price,
            volume=quote.volume,
            created_at=now,
            updated_at=now
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["symbol"],
            set_={
                "price": stmt.excluded.price,
                "volume": stmt.excluded.volume,
                "asset_id": stmt.excluded.asset_id,
                "updated_at": stmt.excluded.updated_at,
            }
        )
        self.session.execute(stmt)

    def record_failure(self, provider_name: str, symbol: str, error: str) -> None:
        self.session.add(FailedIngestion(
            provider=provider_name,
            payload={"symbol": symbol},
            error=error
        ))

    def create_asset_if_missing(self, symbol: str, name: str, asset_class: str) -> bool:
        """Returns True if a new Asset row was created."""
        existing = self.session.scalar(select(Asset).filter_by(symbol=symbol))
        if existing:
            return False
        self.session.add(Asset(
            id=uuid.uuid5(uuid.NAMESPACE_DNS, symbol),
            symbol=symbol,
            name=name,
            asset_class=asset_class
        ))
        return True

    def list_symbols_for_quote_ingestion(self) -> list[tuple[str, str]]:
        """(symbol, asset_class) for every known asset — used by ingest_all_quotes
        to pick which market-data provider to route each symbol to."""
        return [(r[0], r[1]) for r in self.session.query(Asset.symbol, Asset.asset_class).distinct().all()]

    def list_asset_ids_with_quotes(self) -> list[uuid.UUID]:
        return [r[0] for r in self.session.query(LatestQuote.asset_id).distinct().all() if r[0] is not None]

    def list_quoted_symbols(self, limit: int) -> list[str]:
        return [r[0] for r in self.session.query(LatestQuote.symbol).limit(limit).all()]

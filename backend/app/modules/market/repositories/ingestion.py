import uuid
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert

from app.modules.market.entities.market import Asset, LatestQuote
from app.core.entities.system import FailedIngestion, Provider, ProviderUsage
from app.core.providers.models import NormalizedQuote
from app.core.repositories.base import BaseRepository


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
        stmt = insert(LatestQuote).values(
            symbol=quote.symbol,
            asset_id=asset_id,
            price=quote.price,
            volume=quote.volume,
            provider=quote.provider,
            created_at=quote.timestamp,
            updated_at=quote.timestamp
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["symbol"],
            set_={
                "price": stmt.excluded.price,
                "volume": stmt.excluded.volume,
                "asset_id": stmt.excluded.asset_id,
                "provider": stmt.excluded.provider,
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

    def list_quoted_symbols(self, limit: int, crypto_quota: int = 4) -> list[str]:
        """Up to `limit` symbols for fetch_news_task to fetch this cycle, prioritized
        by staleness (never-attempted symbols first, via a NULLS-FIRST ascending sort
        on `Asset.last_news_fetch_at`) rather than the previous plain `LIMIT`, which
        returned an arbitrary table-scan-order slice — see CRYPTO_SENTIMENT_GAP §1:
        with 100+ quoted symbols across every asset class, that made whether a given
        symbol ever got news coverage a matter of table order, not staleness.
        `last_news_fetch_at` is stamped on every attempt regardless of outcome — using
        successful-match time instead would let a symbol Yahoo has no coverage for
        (e.g. a synthetic staking-product ticker) tie for "never fetched" forever and
        starve rotation for every other symbol behind it (confirmed live: `LDBTC-USD`
        did exactly this before switching to an attempt-based timestamp).
        `crypto_quota` reserves that many of the slots for asset_class == 'crypto'
        specifically, since it's dwarfed 2:1 by equities and would otherwise be
        starved even under pure staleness ordering (a one-time equity backlog would
        keep consuming every slot before any crypto symbol's turn came up)."""

        def _pick(class_filter, n: int) -> list[str]:
            if n <= 0:
                return []
            stmt = (
                select(LatestQuote.symbol)
                .outerjoin(Asset, Asset.id == LatestQuote.asset_id)
                .where(class_filter)
                .order_by(Asset.last_news_fetch_at.asc().nullsfirst())
                .limit(n)
            )
            return [r[0] for r in self.session.execute(stmt).all()]

        crypto_symbols = _pick(Asset.asset_class == "crypto", crypto_quota)
        other_symbols = _pick(
            or_(Asset.asset_class != "crypto", Asset.asset_class.is_(None)),
            limit - len(crypto_symbols),
        )
        return crypto_symbols + other_symbols

    def mark_news_fetch_attempted(self, symbol: str) -> None:
        self.session.query(Asset).filter(Asset.symbol == symbol).update(
            {"last_news_fetch_at": datetime.now(timezone.utc)}
        )
        self.session.commit()

    def list_equity_assets_with_quotes(self) -> list[tuple[uuid.UUID, str]]:
        """(asset_id, symbol) for every quoted equity — used by the daily
        fundamentals task, scoped to asset_class == 'equity' per
        FUNDAMENTALS_SCORING_SCOPE.md §2 (crypto/funds/NPS/EPF stay unavailable)."""
        return [
            (r[0], r[1])
            for r in self.session.query(LatestQuote.asset_id, LatestQuote.symbol)
            .join(Asset, Asset.id == LatestQuote.asset_id)
            .filter(Asset.asset_class == "equity")
            .distinct()
            .all()
        ]

    def list_mutual_fund_assets_with_quotes(self) -> list[tuple[uuid.UUID, str]]:
        """(asset_id, symbol) for every mutual_fund asset — used by the daily AMFI
        NAV task. Unlike list_equity_assets_with_quotes, this isn't gated on an
        existing LatestQuote: mutual_fund Assets are only ever created via
        ensure_asset_exists during a real holdings import (no canonical-universe
        seeding for this asset_class), so asset_class alone already scopes this
        to ISINs actually held — see NAV_INGESTION_SCOPE.md §5."""
        return [
            (r[0], r[1])
            for r in self.session.query(Asset.id, Asset.symbol)
            .filter(Asset.asset_class == "mutual_fund")
            .distinct()
            .all()
        ]

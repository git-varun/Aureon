import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import func

from app.domain.entities.ai import AIBriefing
from app.domain.entities.config import AllocationTarget, ProviderConfig
from app.domain.entities.evaluation import AssetScore
from app.domain.entities.market import (
    Asset,
    AssetFeatures,
    AssetSnapshot,
    LatestQuote,
    MarketTheme,
    PriceHistory,
    ThemeWeight,
)
from app.domain.entities.portfolio import PortfolioSnapshot, Position, Transaction
from app.domain.entities.recommendation import Recommendation, RecommendationOutcome
from app.infrastructure.repositories.base import BaseRepository


class IntelligenceRepository(BaseRepository):
    def get_provider_config(self, provider_name: str) -> ProviderConfig | None:
        return self.session.query(ProviderConfig).filter(ProviderConfig.provider_name == provider_name).first()

    def list_allocation_targets(self) -> list[AllocationTarget]:
        return self.session.query(AllocationTarget).all()

    def get_closest_price_history(self, asset_id: uuid.UUID, dt: datetime) -> PriceHistory | None:
        return (
            self.session.query(PriceHistory)
            .filter(PriceHistory.asset_id == asset_id)
            .order_by(func.abs(func.extract("epoch", PriceHistory.timestamp) - func.extract("epoch", dt)))
            .first()
        )

    def get_snapshot(self, asset_id: uuid.UUID) -> AssetSnapshot | None:
        return self.session.query(AssetSnapshot).filter(AssetSnapshot.asset_id == asset_id).first()

    def get_quote_by_asset(self, asset_id: Optional[uuid.UUID]) -> LatestQuote | None:
        if not asset_id:
            return None
        return self.session.query(LatestQuote).filter(LatestQuote.asset_id == asset_id).first()

    def get_quote_by_symbol(self, symbol: str) -> LatestQuote | None:
        return self.session.query(LatestQuote).filter(LatestQuote.symbol == symbol).first()

    def get_all_recommendations(self) -> list[Recommendation]:
        return self.session.query(Recommendation).all()

    def get_recommendation(self, recommendation_id: uuid.UUID) -> Recommendation | None:
        return self.session.query(Recommendation).filter(Recommendation.id == recommendation_id).first()

    def get_features(self, asset_id: uuid.UUID) -> AssetFeatures | None:
        return self.session.query(AssetFeatures).filter(AssetFeatures.asset_id == asset_id).first()

    def get_score(self, asset_id: uuid.UUID) -> AssetScore | None:
        return self.session.query(AssetScore).filter(AssetScore.asset_id == asset_id).first()

    def get_positions(self, portfolio_id: uuid.UUID) -> list[Position]:
        return self.session.query(Position).filter(Position.portfolio_id == portfolio_id).all()

    def get_positions_limited(self, portfolio_id: uuid.UUID, limit: int) -> list[Position]:
        return self.session.query(Position).filter(Position.portfolio_id == portfolio_id).limit(limit).all()

    def get_asset(self, asset_id: uuid.UUID) -> Asset | None:
        return self.session.query(Asset).filter(Asset.id == asset_id).first()

    def get_assets_by_symbols(self, symbols: list[str]) -> list[Asset]:
        return self.session.query(Asset).filter(Asset.symbol.in_(symbols)).all()

    def get_theme_weights_by_symbol(self, symbol: str) -> list[ThemeWeight]:
        return self.session.query(ThemeWeight).filter(ThemeWeight.symbol == symbol).all()

    def get_theme(self, theme_id: str) -> MarketTheme | None:
        return self.session.query(MarketTheme).filter(MarketTheme.theme_id == theme_id).first()

    def get_portfolio_snapshot(self, portfolio_id: uuid.UUID) -> PortfolioSnapshot | None:
        return self.session.query(PortfolioSnapshot).filter(PortfolioSnapshot.portfolio_id == portfolio_id).first()

    def get_outcome(self, recommendation_id: uuid.UUID) -> RecommendationOutcome | None:
        return (
            self.session.query(RecommendationOutcome)
            .filter(RecommendationOutcome.recommendation_id == recommendation_id)
            .first()
        )

    def count_recommendations(self, status: str, created_since: datetime) -> int:
        return (
            self.session.query(Recommendation)
            .filter(Recommendation.status == status)
            .filter(Recommendation.created_at >= created_since)
            .count()
        )

    def count_recent_transactions(self, portfolio_id: uuid.UUID, since: datetime) -> int:
        return (
            self.session.query(Transaction)
            .filter(Transaction.portfolio_id == portfolio_id)
            .filter(Transaction.transaction_date >= since)
            .count()
        )

    def get_transactions_by_portfolio(self, portfolio_id: uuid.UUID) -> list[Transaction]:
        return (
            self.session.query(Transaction)
            .filter(Transaction.portfolio_id == portfolio_id)
            .order_by(Transaction.transaction_date.asc())
            .all()
        )

    def get_price_history_by_assets(self, asset_ids: list[uuid.UUID]) -> list[PriceHistory]:
        return self.session.query(PriceHistory).filter(PriceHistory.asset_id.in_(asset_ids)).all()

    def get_recent_applied_outcomes(self, limit: int) -> list[RecommendationOutcome]:
        return (
            self.session.query(RecommendationOutcome)
            .filter(RecommendationOutcome.status == "applied")
            .order_by(RecommendationOutcome.action_taken_at.desc())
            .limit(limit)
            .all()
        )

    def get_latest_briefing(self) -> AIBriefing | None:
        return (
            self.session.query(AIBriefing)
            .order_by(AIBriefing.created_at.desc())
            .first()
        )

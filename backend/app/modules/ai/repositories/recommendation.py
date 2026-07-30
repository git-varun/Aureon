from app.core.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.market.entities.evaluation import AssetScore
from app.modules.market.entities.market import AssetFeatures, AssetSnapshot, LatestQuote
from app.modules.portfolio.entities.portfolio import Portfolio, Position, Transaction
from app.modules.ai.entities.recommendation import (
    Recommendation,
    RecommendationExplanation,
    RecommendationOutcome,
)


class RecommendationRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def _held_asset_ids(self):
        """Subquery of distinct non-null asset_ids held across every portfolio —
        the whole user's holdings, not one specific portfolio (this app is
        single-user/no-multi-tenancy per CLAUDE.md, so Recommendation stays
        asset-scoped rather than gaining a portfolio_id column)."""
        return select(Position.asset_id).where(Position.asset_id.is_not(None)).distinct()

    def get(self, recommendation_id: uuid.UUID) -> Recommendation | None:
        stmt = select(Recommendation).where(Recommendation.id == recommendation_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_all(self, status: str | None = None) -> list[Recommendation]:
        stmt = select(Recommendation).where(Recommendation.asset_id.in_(self._held_asset_ids()))
        if status:
            stmt = stmt.where(Recommendation.status == status)
        return list(self.session.execute(stmt).scalars().all())

    def list_all_recommendations(self) -> list[Recommendation]:
        return self.session.query(Recommendation).all()

    def get_active_recommendation(self, asset_id: uuid.UUID, version: str) -> Recommendation | None:
        return (
            self.session.query(Recommendation)
            .filter(
                Recommendation.asset_id == asset_id,
                Recommendation.version == version,
                Recommendation.status == "active",
            )
            .first()
        )

    def list_all_snapshots(self) -> list[AssetSnapshot]:
        return self.session.query(AssetSnapshot).all()

    def list_held_snapshots(self) -> list[AssetSnapshot]:
        """AssetSnapshot rows for assets actually held in a portfolio position —
        used by generate_recommendations so scoring never runs for assets the
        user has no position in."""
        stmt = select(AssetSnapshot).where(AssetSnapshot.asset_id.in_(self._held_asset_ids()))
        return list(self.session.execute(stmt).scalars().all())

    def get_snapshot(self, asset_id: uuid.UUID) -> AssetSnapshot | None:
        return self.session.query(AssetSnapshot).filter(AssetSnapshot.asset_id == asset_id).first()

    def get_features(self, asset_id: uuid.UUID) -> AssetFeatures | None:
        return self.session.query(AssetFeatures).filter(AssetFeatures.asset_id == asset_id).first()

    def get_latest_score(self, asset_id: uuid.UUID) -> AssetScore | None:
        return (
            self.session.query(AssetScore)
            .filter(AssetScore.asset_id == asset_id)
            .order_by(AssetScore.generated_at.desc())
            .first()
        )

    def get_quote_by_asset(self, asset_id: uuid.UUID) -> LatestQuote | None:
        return self.session.query(LatestQuote).filter(LatestQuote.asset_id == asset_id).first()

    def get_default_portfolio(self) -> Portfolio | None:
        return self.session.query(Portfolio).first()

    def list_portfolios(self) -> list[Portfolio]:
        return self.session.query(Portfolio).all()

    def get_applied_outcomes(self) -> list[RecommendationOutcome]:
        return (
            self.session.query(RecommendationOutcome)
            .filter(RecommendationOutcome.status == "applied")
            .all()
        )

    def get_portfolio(self, portfolio_id: uuid.UUID) -> Portfolio | None:
        return self.session.query(Portfolio).filter(Portfolio.id == portfolio_id).first()

    def get_transaction(self, transaction_id: uuid.UUID) -> Transaction | None:
        return self.session.query(Transaction).filter(Transaction.id == transaction_id).first()

    def add_transaction(self, txn: Transaction) -> Transaction:
        self.session.add(txn)
        self.session.flush()
        return txn

    def delete_transaction(self, txn: Transaction) -> None:
        self.session.delete(txn)

    def upsert(self, rec: Recommendation) -> Recommendation:
        stmt = insert(Recommendation).values(
            id=rec.id,
            asset_id=rec.asset_id,
            recommendation_state=rec.recommendation_state,
            confidence_score=rec.confidence_score,
            status=rec.status,
            version=rec.version,
            created_at=rec.created_at,
            updated_at=rec.updated_at
        )
        upsert_stmt = stmt.on_conflict_do_update(
            index_elements=['id'],
            set_=dict(
                recommendation_state=stmt.excluded.recommendation_state,
                confidence_score=stmt.excluded.confidence_score,
                status=stmt.excluded.status,
                version=stmt.excluded.version,
                updated_at=stmt.excluded.updated_at
            )
        ).returning(Recommendation)
        result = self.session.execute(upsert_stmt).scalar_one()
        self.session.flush()
        return result

    def get_explanation(self, recommendation_id: uuid.UUID) -> RecommendationExplanation | None:
        stmt = select(RecommendationExplanation).where(RecommendationExplanation.recommendation_id == recommendation_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def upsert_explanation(self, expl: RecommendationExplanation) -> RecommendationExplanation:
        stmt = insert(RecommendationExplanation).values(
            recommendation_id=expl.recommendation_id,
            rules_matched=expl.rules_matched,
            reasoning=expl.reasoning,
            confidence_factors=expl.confidence_factors
        )
        upsert_stmt = stmt.on_conflict_do_update(
            index_elements=['recommendation_id'],
            set_=dict(
                rules_matched=stmt.excluded.rules_matched,
                reasoning=stmt.excluded.reasoning,
                confidence_factors=stmt.excluded.confidence_factors
            )
        ).returning(RecommendationExplanation)
        result = self.session.execute(upsert_stmt).scalar_one()
        self.session.flush()
        return result

    def get_outcome(self, recommendation_id: uuid.UUID) -> RecommendationOutcome | None:
        stmt = select(RecommendationOutcome).where(RecommendationOutcome.recommendation_id == recommendation_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def upsert_outcome(self, out: RecommendationOutcome) -> RecommendationOutcome:
        stmt = insert(RecommendationOutcome).values(
            recommendation_id=out.recommendation_id,
            status=out.status,
            action_taken_at=out.action_taken_at,
            dismiss_reason=out.dismiss_reason,
            ledger_transaction_id=out.ledger_transaction_id,
            predicted_impact=out.predicted_impact,
            realized_impact=out.realized_impact
        )
        upsert_stmt = stmt.on_conflict_do_update(
            index_elements=['recommendation_id'],
            set_=dict(
                status=stmt.excluded.status,
                action_taken_at=stmt.excluded.action_taken_at,
                dismiss_reason=stmt.excluded.dismiss_reason,
                ledger_transaction_id=stmt.excluded.ledger_transaction_id,
                predicted_impact=stmt.excluded.predicted_impact,
                realized_impact=stmt.excluded.realized_impact
            )
        ).returning(RecommendationOutcome)
        result = self.session.execute(upsert_stmt).scalar_one()
        self.session.flush()
        return result

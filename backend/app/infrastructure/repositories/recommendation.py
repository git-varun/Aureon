from app.infrastructure.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.domain.entities.evaluation import AssetScore
from app.domain.entities.market import AssetFeatures, AssetSnapshot, LatestQuote
from app.domain.entities.portfolio import Portfolio, Transaction
from app.domain.entities.recommendation import (
    Recommendation,
    RecommendationExplanation,
    RecommendationOutcome,
)
from app.domain.entities.system import Organization, OrganizationMember


class RecommendationRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def get(self, recommendation_id: uuid.UUID) -> Recommendation | None:
        stmt = select(Recommendation).where(Recommendation.id == recommendation_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_by_org(self, organization_id: uuid.UUID, status: str | None = None) -> list[Recommendation]:
        stmt = select(Recommendation).where(Recommendation.organization_id == organization_id)
        if status:
            stmt = stmt.where(Recommendation.status == status)
        return list(self.session.execute(stmt).scalars().all())

    def get_active_recommendation(self, organization_id: uuid.UUID, asset_id: uuid.UUID, version: str) -> Recommendation | None:
        return (
            self.session.query(Recommendation)
            .filter(
                Recommendation.organization_id == organization_id,
                Recommendation.asset_id == asset_id,
                Recommendation.version == version,
                Recommendation.status == "active",
            )
            .first()
        )

    def list_all_snapshots(self) -> list[AssetSnapshot]:
        return self.session.query(AssetSnapshot).all()

    def get_snapshot(self, asset_id: uuid.UUID) -> AssetSnapshot | None:
        return self.session.query(AssetSnapshot).filter(AssetSnapshot.asset_id == asset_id).first()

    def list_organizations(self) -> list[Organization]:
        return self.session.query(Organization).all()

    def get_first_member_by_org(self, organization_id: uuid.UUID) -> OrganizationMember | None:
        return self.session.query(OrganizationMember).filter(OrganizationMember.organization_id == organization_id).first()

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

    def get_portfolio_by_org(self, organization_id: uuid.UUID) -> Portfolio | None:
        return self.session.query(Portfolio).filter(Portfolio.organization_id == organization_id).first()

    def list_portfolios_by_org(self, organization_id: uuid.UUID) -> list[Portfolio]:
        return self.session.query(Portfolio).filter(Portfolio.organization_id == organization_id).all()

    def get_applied_outcomes_by_org(self, organization_id: uuid.UUID) -> list[RecommendationOutcome]:
        return (
            self.session.query(RecommendationOutcome)
            .join(Recommendation, Recommendation.id == RecommendationOutcome.recommendation_id)
            .filter(Recommendation.organization_id == organization_id)
            .filter(RecommendationOutcome.status == "applied")
            .all()
        )

    def get_portfolio(self, portfolio_id: uuid.UUID, organization_id: uuid.UUID) -> Portfolio | None:
        return (
            self.session.query(Portfolio)
            .filter(Portfolio.id == portfolio_id, Portfolio.organization_id == organization_id)
            .first()
        )

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
            organization_id=rec.organization_id,
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

from app.domain.services.base import BaseService
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.core.redis import (
    cache_org_recommendations,
    get_cached_org_recommendations,
    invalidate_org_recommendations,
)
from app.domain.entities.portfolio import Transaction
from app.domain.entities.recommendation import (
    Recommendation,
    RecommendationExplanation,
    RecommendationOutcome,
)
from app.infrastructure.repositories.recommendation import RecommendationRepository


def serialize_recommendation(rec: Recommendation, session: Session) -> dict[str, Any]:
    repo = RecommendationRepository(session)
    expl = repo.get_explanation(rec.id)
    out = repo.get_outcome(rec.id)
    quote = repo.get_quote_by_asset(rec.asset_id)
    symbol = quote.symbol if quote else None
    
    return {
        "id": str(rec.id),
        "organization_id": str(rec.organization_id),
        "asset_id": str(rec.asset_id),
        "symbol": symbol,
        "recommendation_state": rec.recommendation_state,
        "confidence_score": float(rec.confidence_score),
        "status": rec.status,
        "version": rec.version,
        "created_at": rec.created_at.isoformat() if rec.created_at else None,
        "updated_at": rec.updated_at.isoformat() if rec.updated_at else None,
        "explanation": {
            "rules_matched": expl.rules_matched if expl else {},
            "reasoning": expl.reasoning if expl else "",
            "confidence_factors": expl.confidence_factors if expl else {}
        } if expl else None,
        "outcome": {
            "status": out.status if out else "active",
            "action_taken_at": out.action_taken_at.isoformat() if out and out.action_taken_at else None,
            "dismiss_reason": out.dismiss_reason if out else None,
            "ledger_transaction_id": str(out.ledger_transaction_id) if out and out.ledger_transaction_id else None,
            "predicted_impact": float(out.predicted_impact) if out and out.predicted_impact is not None else None,
            "realized_impact": float(out.realized_impact) if out and out.realized_impact is not None else None
        } if out else None
    }

class RecommendationService(BaseService):
    def __init__(self, session: Session):
        self.session = session
        self.repo = RecommendationRepository(session)

    def generate_recommendations(self, organization_id: uuid.UUID) -> list[dict[str, Any]]:
        snapshots = self.repo.list_all_snapshots()
        recs_created = []

        for snap in snapshots:
            asset_id = snap.asset_id
            features = self.repo.get_features(asset_id)
            scores = self.repo.get_latest_score(asset_id)
            
            if not features or not scores:
                continue
                
            momentum = float(features.momentum_score) if features.momentum_score is not None else 0.5
            volatility = float(features.volatility_score) if features.volatility_score is not None else 0.3
            sentiment = float(features.sentiment_score) if features.sentiment_score is not None else 0.5
            
            quality = float(scores.quality_score) if scores.quality_score is not None else 0.8
            valuation = float(scores.valuation_score) if scores.valuation_score is not None else 0.7
            
            # Rule Engine (Deterministic)
            rec_state = "HOLD"
            reasoning = "Asset parameters remain within stable bounds. Recommending holding current position."
            rules_matched = {}
            confidence_factors = {}
            confidence_score = 0.5
            
            if valuation >= 0.7 and momentum >= 0.5 and sentiment >= 0.5:
                rec_state = "BUY"
                reasoning = "Asset displays strong underpricing combined with positive momentum and constructive market sentiment."
                rules_matched = {"underpricing_and_momentum": True}
                confidence_factors = {"valuation": 0.4, "momentum": 0.3, "sentiment": 0.3}
                confidence_score = 0.4 * valuation + 0.3 * momentum + 0.3 * sentiment
            elif sentiment < 0.3 and momentum < 0.4:
                rec_state = "AVOID"
                reasoning = "Asset displays weak market sentiment and negative momentum, prompting caution."
                rules_matched = {"weak_sentiment_and_momentum": True}
                confidence_factors = {"sentiment": 0.5, "momentum": 0.5}
                confidence_score = 0.5 * (1.0 - sentiment) + 0.5 * (1.0 - momentum)
            elif valuation < 0.4 and volatility >= 0.6:
                rec_state = "REDUCE"
                reasoning = "Asset is potentially overvalued with elevated volatility, recommending reducing exposure."
                rules_matched = {"overvaluation_and_volatility": True}
                confidence_factors = {"valuation": 0.5, "volatility": 0.5}
                confidence_score = 0.5 * (1.0 - valuation) + 0.5 * volatility
            else:
                rec_state = "HOLD"
                reasoning = "Asset parameters remain within stable bounds. Recommending holding current position."
                rules_matched = {"stable_parameters": True}
                confidence_factors = {"quality": 0.5, "volatility": 0.5}
                confidence_score = 0.5 * quality + 0.5 * (1.0 - volatility)
                
            existing_rec = self.repo.get_active_recommendation(organization_id, asset_id, "v2.0.0")

            rec_id = existing_rec.id if existing_rec else uuid.uuid4()
            
            rec = Recommendation(
                id=rec_id,
                organization_id=organization_id,
                asset_id=asset_id,
                recommendation_state=rec_state,
                confidence_score=confidence_score,
                status="active",
                version="v2.0.0",
                created_at=existing_rec.created_at if existing_rec else datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
            self.repo.upsert(rec)
            
            expl = RecommendationExplanation(
                recommendation_id=rec_id,
                rules_matched=rules_matched,
                reasoning=reasoning,
                confidence_factors=confidence_factors
            )
            self.repo.upsert_explanation(expl)
            
            existing_outcome = self.repo.get_outcome(rec_id)
            if not existing_outcome:
                out = RecommendationOutcome(
                    recommendation_id=rec_id,
                    status="active",
                    action_taken_at=datetime.now(timezone.utc)
                )
                self.repo.upsert_outcome(out)
                
            recs_created.append(rec)
            
        self.session.commit()
        invalidate_org_recommendations(str(organization_id))
        return [serialize_recommendation(r, self.session) for r in recs_created]

    def get_recommendations(self, organization_id: uuid.UUID, status: str | None = None) -> list[dict[str, Any]]:
        cached = get_cached_org_recommendations(str(organization_id))
        if cached is not None:
            if status:
                return [r for r in cached if r.get("status") == status]
            return cached
            
        recs = self.repo.get_by_org(organization_id)
        serialized = [serialize_recommendation(r, self.session) for r in recs]
        cache_org_recommendations(str(organization_id), serialized)
        
        if status:
            return [r for r in serialized if r.get("status") == status]
        return serialized

    def apply_recommendation(self, recommendation_id: uuid.UUID, portfolio_id: uuid.UUID | None = None, actor_id: Optional[uuid.UUID] = None) -> dict[str, Any]:
        rec = self.repo.get(recommendation_id)
        if not rec:
            raise NotFoundError("Recommendation not found")
            
        if rec.status != "active":
            raise ValidationError(f"Recommendation is already {rec.status}")
            
        if not portfolio_id:
            portfolio = self.repo.get_portfolio_by_org(rec.organization_id)
            if not portfolio:
                raise ValidationError("No portfolios found for this organization to apply recommendation")
            portfolio_id = portfolio.id
        else:
            portfolio = self.repo.get_portfolio(portfolio_id, rec.organization_id)
            if not portfolio:
                raise ValidationError("Invalid portfolio for this organization")

        quote = self.repo.get_quote_by_asset(rec.asset_id)
        symbol = quote.symbol if quote else "UNKNOWN"
        price = float(quote.price) if quote else 0.0

        txn = Transaction(
            id=uuid.uuid4(),
            portfolio_id=portfolio_id,
            symbol=symbol,
            asset_id=rec.asset_id,
            transaction_type="BUY" if rec.recommendation_state == "BUY" else "SELL" if rec.recommendation_state in ("REDUCE", "AVOID") else "HOLD",
            quantity=1.0 if rec.recommendation_state in ("BUY", "REDUCE", "AVOID") else 0.0,
            price=price,
            transaction_date=datetime.now(timezone.utc),
            fees=0.0,
            taxes=0.0,
            notes=f"Applied recommendation {rec.id} ({rec.recommendation_state})",
            broker="aureon",
            kind="trade"
        )
        self.repo.add_transaction(txn)
        
        rec.status = "applied"
        rec.updated_at = datetime.now(timezone.utc)
        self.repo.upsert(rec)
        
        out = self.repo.get_outcome(recommendation_id)
        if not out:
            out = RecommendationOutcome(
                recommendation_id=recommendation_id,
                status="applied",
                action_taken_at=datetime.now(timezone.utc)
            )
        out.status = "applied"
        out.action_taken_at = datetime.now(timezone.utc)
        out.ledger_transaction_id = txn.id
        out.predicted_impact = 0.05 if rec.recommendation_state == "BUY" else -0.05 if rec.recommendation_state in ("REDUCE", "AVOID") else 0.0
        self.repo.upsert_outcome(out)
        
        from app.domain.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="recommendation_apply",
            entity_type="recommendation",
            entity_id=str(recommendation_id),
            actor_id=actor_id,
            details={"recommendation_state": rec.recommendation_state, "portfolio_id": str(portfolio_id), "organization_id": str(rec.organization_id)}
        )
        
        self.session.commit()
        invalidate_org_recommendations(str(rec.organization_id))
        
        try:
            from app.workers.evaluation.scoring import (
                update_financial_intelligence_pipeline,
            )
            update_financial_intelligence_pipeline(self.session, rec.organization_id)
        except Exception:
            pass
        
        return serialize_recommendation(rec, self.session)

    def dismiss_recommendation(self, recommendation_id: uuid.UUID, reason: str | None = None, actor_id: Optional[uuid.UUID] = None) -> dict[str, Any]:
        rec = self.repo.get(recommendation_id)
        if not rec:
            raise NotFoundError("Recommendation not found")
            
        if rec.status != "active":
            raise ValidationError(f"Recommendation is already {rec.status}")
            
        rec.status = "dismissed"
        rec.updated_at = datetime.now(timezone.utc)
        self.repo.upsert(rec)
        
        out = self.repo.get_outcome(recommendation_id)
        if not out:
            out = RecommendationOutcome(
                recommendation_id=recommendation_id,
                status="dismissed",
                action_taken_at=datetime.now(timezone.utc)
            )
        out.status = "dismissed"
        out.action_taken_at = datetime.now(timezone.utc)
        out.dismiss_reason = reason
        self.repo.upsert_outcome(out)
        
        from app.domain.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="recommendation_dismiss",
            entity_type="recommendation",
            entity_id=str(recommendation_id),
            actor_id=actor_id,
            details={"reason": reason, "organization_id": str(rec.organization_id)}
        )
        
        self.session.commit()
        invalidate_org_recommendations(str(rec.organization_id))
        
        try:
            from app.workers.evaluation.scoring import (
                update_financial_intelligence_pipeline,
            )
            update_financial_intelligence_pipeline(self.session, rec.organization_id)
        except Exception:
            pass
        
        return serialize_recommendation(rec, self.session)

    def undo_recommendation(self, recommendation_id: uuid.UUID, actor_id: Optional[uuid.UUID] = None) -> dict[str, Any]:
        rec = self.repo.get(recommendation_id)
        if not rec:
            raise NotFoundError("Recommendation not found")
            
        if rec.status == "active":
            raise ValidationError("Recommendation is already active")
            
        out = self.repo.get_outcome(recommendation_id)
        if out and out.ledger_transaction_id:
            txn = self.repo.get_transaction(out.ledger_transaction_id)
            if txn:
                self.repo.delete_transaction(txn)
                
        rec.status = "active"
        rec.updated_at = datetime.now(timezone.utc)
        self.repo.upsert(rec)
        
        if out:
            out.status = "active"
            out.action_taken_at = datetime.now(timezone.utc)
            out.ledger_transaction_id = None
            out.dismiss_reason = None
            self.repo.upsert_outcome(out)
            
        from app.domain.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="recommendation_undo",
            entity_type="recommendation",
            entity_id=str(recommendation_id),
            actor_id=actor_id,
            details={"previous_status": rec.status, "organization_id": str(rec.organization_id)}
        )
            
        self.session.commit()
        invalidate_org_recommendations(str(rec.organization_id))
        
        try:
            from app.workers.evaluation.scoring import (
                update_financial_intelligence_pipeline,
            )
            update_financial_intelligence_pipeline(self.session, rec.organization_id)
        except Exception:
            pass
            
        return serialize_recommendation(rec, self.session)

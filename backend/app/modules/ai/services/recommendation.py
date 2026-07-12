from app.core.services.base import BaseService
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import ContextManager, logger
from app.core.redis import (
    cache_asset_scores,
    cache_intelligence_dashboard,
    cache_intelligence_health,
    cache_intelligence_outcomes,
    cache_intelligence_portfolio,
    cache_intelligence_recommendations,
    cache_org_recommendations,
    get_cached_asset_signals,
    get_cached_org_recommendations,
    invalidate_org_recommendations,
)

RECOMMENDATIONS_CACHE_KEY = "global"
from app.modules.market.entities.evaluation import AssetScore, FeatureSnapshot
from app.modules.portfolio.entities.portfolio import Transaction
from app.modules.ai.entities.recommendation import (
    Recommendation,
    RecommendationExplanation,
    RecommendationOutcome,
)
from app.modules.market.repositories.asset_features import AssetFeaturesRepository
from app.modules.market.repositories.asset_scores import AssetScoresRepository
from app.modules.ai.repositories.feature_snapshots import FeatureSnapshotsRepository
from app.modules.ai.repositories.recommendation import RecommendationRepository


def serialize_recommendation(rec: Recommendation, session: Session) -> dict[str, Any]:
    repo = RecommendationRepository(session)
    expl = repo.get_explanation(rec.id)
    out = repo.get_outcome(rec.id)
    quote = repo.get_quote_by_asset(rec.asset_id)
    symbol = quote.symbol if quote else None
    
    return {
        "id": str(rec.id),
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

    def _score_and_materialize(self, asset_id: uuid.UUID, features: Any, scores: Any) -> Optional[Recommendation]:
        """Shared rule engine + persistence used by both the scheduled per-asset
        pipeline (materialize_for_asset) and the manual batch trigger
        (generate_recommendations). Returns None without writing anything if a
        required factor hasn't been computed yet — never fabricates a neutral
        substitute for a missing value."""
        required_factors = (
            features.momentum_score,
            features.volatility_score,
            features.sentiment_score,
            scores.quality_score,
            scores.valuation_score,
        )
        if any(f is None for f in required_factors):
            # A required factor hasn't been computed yet for this asset —
            # skip rather than run the rule engine on a fabricated neutral value.
            return None

        momentum = float(features.momentum_score)
        volatility = float(features.volatility_score)
        sentiment = float(features.sentiment_score)

        quality = float(scores.quality_score)
        valuation = float(scores.valuation_score)

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

        existing_rec = self.repo.get_active_recommendation(asset_id, "v2.0.0")

        rec_id = existing_rec.id if existing_rec else uuid.uuid4()

        rec = Recommendation(
            id=rec_id,
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

        return rec

    def generate_recommendations(self) -> list[dict[str, Any]]:
        snapshots = self.repo.list_all_snapshots()
        recs_created = []

        for snap in snapshots:
            asset_id = snap.asset_id
            features = self.repo.get_features(asset_id)
            scores = self.repo.get_latest_score(asset_id)

            if not features or not scores:
                continue

            rec = self._score_and_materialize(asset_id, features, scores)
            if rec is not None:
                recs_created.append(rec)

        self.session.commit()
        invalidate_org_recommendations(RECOMMENDATIONS_CACHE_KEY)
        return [serialize_recommendation(r, self.session) for r in recs_created]

    def get_recommendations(self, status: str | None = None) -> list[dict[str, Any]]:
        cached = get_cached_org_recommendations(RECOMMENDATIONS_CACHE_KEY)
        if cached is not None:
            if status:
                return [r for r in cached if r.get("status") == status]
            return cached

        recs = self.repo.get_all()
        serialized = [serialize_recommendation(r, self.session) for r in recs]
        cache_org_recommendations(RECOMMENDATIONS_CACHE_KEY, serialized)

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
            portfolio = self.repo.get_default_portfolio()
            if not portfolio:
                raise ValidationError("No portfolios found to apply recommendation")
            portfolio_id = portfolio.id
        else:
            portfolio = self.repo.get_portfolio(portfolio_id)
            if not portfolio:
                raise ValidationError("Invalid portfolio")

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
        
        from app.core.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="recommendation_apply",
            entity_type="recommendation",
            entity_id=str(recommendation_id),
            actor_id=actor_id,
            details={"recommendation_state": rec.recommendation_state, "portfolio_id": str(portfolio_id)}
        )

        self.session.commit()
        invalidate_org_recommendations(RECOMMENDATIONS_CACHE_KEY)

        try:
            self.update_financial_intelligence_pipeline()
        except Exception as e:
            logger.warning(
                f"intelligence_pipeline_refresh_failed operation=apply_recommendation "
                f"recommendation_id={recommendation_id} portfolio_id={portfolio_id} error={str(e)}"
            )

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
        
        from app.core.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="recommendation_dismiss",
            entity_type="recommendation",
            entity_id=str(recommendation_id),
            actor_id=actor_id,
            details={"reason": reason}
        )

        self.session.commit()
        invalidate_org_recommendations(RECOMMENDATIONS_CACHE_KEY)

        try:
            self.update_financial_intelligence_pipeline()
        except Exception as e:
            logger.warning(
                f"intelligence_pipeline_refresh_failed operation=dismiss_recommendation "
                f"recommendation_id={recommendation_id} error={str(e)}"
            )

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
            
        from app.core.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="recommendation_undo",
            entity_type="recommendation",
            entity_id=str(recommendation_id),
            actor_id=actor_id,
            details={"previous_status": rec.status}
        )

        self.session.commit()
        invalidate_org_recommendations(RECOMMENDATIONS_CACHE_KEY)

        try:
            self.update_financial_intelligence_pipeline()
        except Exception as e:
            logger.warning(
                f"intelligence_pipeline_refresh_failed operation=undo_recommendation "
                f"recommendation_id={recommendation_id} error={str(e)}"
            )

        return serialize_recommendation(rec, self.session)

    def generate_and_score_asset(self, asset_id: uuid.UUID) -> bool:
        """Validates an asset's latest features, computes recommendation/quality/valuation
        scores, persists a FeatureSnapshot + AssetScore, caches the result, and materializes
        recommendations from it. Returns False (no-op) if the asset has no features yet."""
        from app.modules.ai.services.evaluation import validate_features

        evaluation_id = str(uuid.uuid4())
        with ContextManager(extra_fields={"evaluation_id": evaluation_id, "asset_id": str(asset_id), "module": "evaluation"}):
            logger.info(f"AI Evaluation started: evaluation_id={evaluation_id} asset_id={asset_id}")

            features_repo = AssetFeaturesRepository(self.session)
            asset_features = features_repo.get(asset_id)
            if not asset_features:
                return False

            features_dict = {
                "price": float(asset_features.price) if asset_features.price is not None else None,
                "market_cap": float(asset_features.market_cap) if asset_features.market_cap is not None else None,
                "momentum_score": float(asset_features.momentum_score) if asset_features.momentum_score is not None else None,
                "volatility_score": float(asset_features.volatility_score) if asset_features.volatility_score is not None else None,
                "sentiment_score": float(asset_features.sentiment_score) if asset_features.sentiment_score is not None else None,
            }

            validate_features(features_dict)
            logger.info(f"AI Evaluation features validated: {features_dict}")

            # Retrieve signals from cache
            signals = get_cached_asset_signals(str(asset_id)) or {}
            action = signals.get("action", "HOLD")

            momentum = features_dict["momentum_score"]
            volatility = features_dict["volatility_score"]
            sentiment = features_dict["sentiment_score"]

            unavailable_inputs = []

            # Compute recommendation_score from whichever of momentum/volatility/
            # sentiment are actually present, renormalizing their base weights
            # (0.4/0.3/0.3) over just the available inputs — a partial score
            # from real data, never a fabricated neutral substitute for a
            # missing one. See EVALUATION_MODULE_AUDIT.md 1a.
            weighted_terms = []
            if momentum is not None:
                weighted_terms.append((0.4, momentum))
            else:
                unavailable_inputs.append("momentum_score")
            if volatility is not None:
                weighted_terms.append((0.3, 1.0 - volatility))
            else:
                unavailable_inputs.append("volatility_score")
            if sentiment is not None:
                weighted_terms.append((0.3, sentiment))
            else:
                unavailable_inputs.append("sentiment_score")

            if weighted_terms:
                total_weight = sum(w for w, _ in weighted_terms)
                rec_score = sum(w * v for w, v in weighted_terms) / total_weight

                # Adjust recommendation based on action
                if action == "BUY":
                    rec_score = min(1.0, rec_score + 0.1)
                elif action == "SELL":
                    rec_score = max(0.0, rec_score - 0.1)

                recommendation_score = max(0.0, min(1.0, rec_score))
            else:
                recommendation_score = None

            # Real quality/valuation scoring needs fundamentals data (market
            # cap, P/E) that this pipeline doesn't have yet — deferred build,
            # see EVALUATION_MODULE_AUDIT.md 1b. Presenting a placeholder as a
            # computed score is exactly the fabrication this fix removes, so
            # these are always "unavailable" until that data source exists.
            quality_score = None
            valuation_score = None
            unavailable_inputs.append("quality_score")
            unavailable_inputs.append("valuation_score")

            model_version = "v1.0.0"
            feature_schema_version = "1.0"
            now = datetime.now(timezone.utc)

            # Store Feature Snapshot
            snapshot_repo = FeatureSnapshotsRepository(self.session)
            snapshot = FeatureSnapshot(
                asset_id=asset_id,
                snapshot_at=now,
                model_version=model_version,
                feature_schema_version=feature_schema_version,
                features=features_dict
            )
            snapshot_repo.insert(snapshot)
            self.session.commit()

            # Store Asset Score
            scores_repo = AssetScoresRepository(self.session)
            score = AssetScore(
                asset_id=asset_id,
                model_version=model_version,
                recommendation_score=recommendation_score,
                quality_score=quality_score,
                valuation_score=valuation_score,
                unavailable_inputs=unavailable_inputs,
                generated_at=now
            )
            updated_score = scores_repo.upsert(score)
            self.session.commit()

            cache_data = {
                "asset_id": str(updated_score.asset_id),
                "model_version": updated_score.model_version,
                "recommendation_score": float(updated_score.recommendation_score) if updated_score.recommendation_score is not None else None,
                "quality_score": float(updated_score.quality_score) if updated_score.quality_score is not None else None,
                "valuation_score": float(updated_score.valuation_score) if updated_score.valuation_score is not None else None,
                "unavailable_inputs": updated_score.unavailable_inputs,
                "generated_at": updated_score.generated_at.isoformat() if updated_score.generated_at else None
            }
            cache_asset_scores(str(asset_id), cache_data)
            logger.info(f"AI Evaluation scores persisted and cached: scores={cache_data}")

            # Trigger automatic recommendation materialization
            self.materialize_for_asset(asset_id, evaluation_id)

            return True

    def materialize_for_asset(self, asset_id: uuid.UUID, evaluation_id: Optional[str] = None) -> None:
        eval_id = evaluation_id or str(uuid.uuid4())
        with ContextManager(extra_fields={"evaluation_id": eval_id, "asset_id": str(asset_id), "module": "evaluation"}):
            logger.info(f"AI Recommendation materialization started: evaluation_id={eval_id} asset_id={asset_id}")

            # Load snapshot, features, scores
            snap = self.repo.get_snapshot(asset_id)
            features = self.repo.get_features(asset_id)
            scores = self.repo.get_latest_score(asset_id)

            if not snap or not features or not scores:
                return

            rec = self._score_and_materialize(asset_id, features, scores)
            if rec is None:
                logger.info(
                    f"AI Recommendation materialization skipped: evaluation_id={eval_id} "
                    f"asset_id={asset_id} reason=required_factor_missing"
                )
                return

            # Commit the recommendation write immediately so a later failure in
            # update_financial_intelligence_pipeline (unrelated outcome/portfolio
            # work, same session) can't roll back an already-decided recommendation.
            self.session.commit()

            # Invalidate Cache
            invalidate_org_recommendations(RECOMMENDATIONS_CACHE_KEY)

            # Downstream intelligence pipeline update
            self.update_financial_intelligence_pipeline()

            logger.info(f"AI Recommendation materialization completed: state={rec.recommendation_state}")

    def update_financial_intelligence_pipeline(self) -> None:
        """Automatic downstream updates for outcomes, portfolio intelligence, health, and dashboard."""
        from app.modules.ai.services.intelligence import FinancialIntelligenceService

        intel_svc = FinancialIntelligenceService(self.session)

        # 1. Outcome Updates
        applied_outcomes = self.repo.get_applied_outcomes()
        for o in applied_outcomes:
            rec = self.repo.get(o.recommendation_id)
            if not rec:
                continue
            p0 = None
            if o.ledger_transaction_id:
                txn = self.repo.get_transaction(o.ledger_transaction_id)
                if txn:
                    p0 = float(txn.price)
            if p0 is None:
                p0 = intel_svc._get_asset_price_at_time(rec.asset_id, rec.created_at)

            if p0 is None:
                # No real price data at all — skip updating this outcome's
                # realized_impact rather than fabricate a return.
                continue

            quote = self.repo.get_quote_by_asset(rec.asset_id)
            p_current = float(quote.price) if quote and quote.price is not None else p0

            raw_return = (p_current - p0) / p0 if p0 > 0 else 0.0
            realized_impact = -raw_return if rec.recommendation_state in ["REDUCE", "AVOID"] else raw_return
            o.realized_impact = realized_impact

        self.session.commit()

        # 2. Portfolio Intelligence, Financial Health, and Dashboard Cache
        portfolios = self.repo.list_portfolios()
        for portfolio in portfolios:
            portfolio_id = portfolio.id
            pid_str = str(portfolio_id)

            # Portfolio Intelligence (diversification, concentration, cash opportunities)
            div = intel_svc.get_portfolio_diversification_score(portfolio_id)
            conc = intel_svc.get_portfolio_concentration_analysis(portfolio_id)
            cash = intel_svc.get_cash_deployment_opportunities(portfolio_id)

            portfolio_data = {
                "diversification": div,
                "concentration": conc,
                "cash_opportunities": cash
            }
            cache_intelligence_portfolio(pid_str, portfolio_data)

            # Financial Health
            health = intel_svc.get_investor_health_score(portfolio_id)
            cache_intelligence_health(pid_str, health)

            # Cache Recommendations
            recs = self.repo.get_all()
            serialized_recs = [serialize_recommendation(r, self.session) for r in recs]
            cache_intelligence_recommendations(pid_str, serialized_recs)

            # Cache Outcomes
            quality_metrics = intel_svc.get_recommendation_quality_metrics()
            performance = intel_svc.get_recommendation_performance()
            outcomes_data = {
                "quality_metrics": quality_metrics,
                "performance": performance
            }
            cache_intelligence_outcomes(pid_str, outcomes_data)

            # 3. Dashboard Cache
            user_id = uuid.UUID("00000000-0000-0000-0000-000000000000")

            dashboard = intel_svc.get_dashboard_aggregation(portfolio_id, user_id)
            cache_intelligence_dashboard(pid_str, dashboard)

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.redis import cache_asset_scores, get_cached_asset_signals
from app.domain.entities.evaluation import AssetScore, FeatureSnapshot
from app.infrastructure.repositories.asset_features import AssetFeaturesRepository
from app.infrastructure.repositories.asset_scores import AssetScoresRepository
from app.infrastructure.repositories.feature_snapshots import FeatureSnapshotsRepository
from app.workers.evaluation.validation import validate_features


from app.core.logger import logger
from app.core.request_context import ContextManager

def generate_scores(asset_id: uuid.UUID) -> None:
    evaluation_id = str(uuid.uuid4())
    with ContextManager(extra_fields={"evaluation_id": evaluation_id, "asset_id": str(asset_id), "module": "evaluation"}):
        logger.info(f"AI Evaluation started: evaluation_id={evaluation_id} asset_id={asset_id}")
        with SessionLocal() as session:
            features_repo = AssetFeaturesRepository(session)
            asset_features = features_repo.get(asset_id)
            if not asset_features:
                return

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

            momentum = features_dict["momentum_score"] if features_dict["momentum_score"] is not None else 0.5
            volatility = features_dict["volatility_score"] if features_dict["volatility_score"] is not None else 0.5
            sentiment = features_dict["sentiment_score"] if features_dict["sentiment_score"] is not None else 0.5

            # Compute dynamic scores
            # High momentum + low volatility + positive sentiment -> high recommendation
            rec_score = 0.4 * momentum + 0.3 * (1.0 - volatility) + 0.3 * sentiment
            
            # Adjust recommendation based on action
            if action == "BUY":
                rec_score = min(1.0, rec_score + 0.1)
            elif action == "SELL":
                rec_score = max(0.0, rec_score - 0.1)

            recommendation_score = max(0.0, min(1.0, rec_score))
            quality_score = 0.8 + (0.05 if sentiment > 0.6 else 0.0)
            valuation_score = 0.7 + (0.1 if momentum < 0.4 else 0.0) # lower momentum is undervalued

            model_version = "v1.0.0"
            feature_schema_version = "1.0"
            now = datetime.now(timezone.utc)

            # Store Feature Snapshot
            snapshot_repo = FeatureSnapshotsRepository(session)
            snapshot = FeatureSnapshot(
                asset_id=asset_id,
                snapshot_at=now,
                model_version=model_version,
                feature_schema_version=feature_schema_version,
                features=features_dict
            )
            snapshot_repo.insert(snapshot)
            session.commit()

            # Store Asset Score
            scores_repo = AssetScoresRepository(session)
            score = AssetScore(
                asset_id=asset_id,
                model_version=model_version,
                recommendation_score=recommendation_score,
                quality_score=quality_score,
                valuation_score=valuation_score,
                generated_at=now
            )
            updated_score = scores_repo.upsert(score)
            session.commit()

            cache_data = {
                "asset_id": str(updated_score.asset_id),
                "model_version": updated_score.model_version,
                "recommendation_score": float(updated_score.recommendation_score),
                "quality_score": float(updated_score.quality_score),
                "valuation_score": float(updated_score.valuation_score),
                "generated_at": updated_score.generated_at.isoformat() if updated_score.generated_at else None
            }
            cache_asset_scores(str(asset_id), cache_data)
            logger.info(f"AI Evaluation scores persisted and cached: scores={cache_data}")

            # Trigger downstream health updates
            from app.workers.monitoring.asset_health import compute_asset_health
            compute_asset_health(asset_id)

            # Trigger automatic recommendation materialization
            materialize_recommendations_for_asset(asset_id, evaluation_id)


def materialize_recommendations_for_asset(asset_id: uuid.UUID, evaluation_id: Optional[str] = None) -> None:
    eval_id = evaluation_id or str(uuid.uuid4())
    with ContextManager(extra_fields={"evaluation_id": eval_id, "asset_id": str(asset_id), "module": "evaluation"}):
        logger.info(f"AI Recommendation materialization started: evaluation_id={eval_id} asset_id={asset_id}")
        with SessionLocal() as session:
            from app.domain.entities.evaluation import AssetScore
            from app.domain.entities.market import AssetFeatures, AssetSnapshot
            from app.domain.entities.recommendation import (
                Recommendation,
                RecommendationExplanation,
                RecommendationOutcome,
            )
            from app.domain.entities.system import Organization
            from app.infrastructure.repositories.recommendation import (
                RecommendationRepository,
            )

            # Load snapshot, features, scores
            snap = session.query(AssetSnapshot).filter(AssetSnapshot.asset_id == asset_id).first()
            features = session.query(AssetFeatures).filter(AssetFeatures.asset_id == asset_id).first()
            scores = session.query(AssetScore).filter(AssetScore.asset_id == asset_id).order_by(AssetScore.generated_at.desc()).first()

            if not snap or not features or not scores:
                return

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
                confidence_score = 0.5 * quality + 0.5 * (1.0 - volatility)

            logger.info(
                f"AI Evaluation rule engine run: state={rec_state} "
                f"rules_matched={list(rules_matched.keys())} confidence={confidence_score:.4f}"
            )

            repo = RecommendationRepository(session)
            orgs = session.query(Organization).all()

            for org in orgs:
                existing_rec = session.query(Recommendation).filter(
                    Recommendation.organization_id == org.id,
                    Recommendation.asset_id == asset_id,
                    Recommendation.version == "v2.0.0",
                    Recommendation.status == "active"
                ).first()

                rec_id = existing_rec.id if existing_rec else uuid.uuid4()

                rec = Recommendation(
                    id=rec_id,
                    organization_id=org.id,
                    asset_id=asset_id,
                    recommendation_state=rec_state,
                    confidence_score=confidence_score,
                    status="active",
                    version="v2.0.0",
                    created_at=existing_rec.created_at if existing_rec else datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
                repo.upsert(rec)

                expl = RecommendationExplanation(
                    recommendation_id=rec_id,
                    rules_matched=rules_matched,
                    reasoning=reasoning,
                    confidence_factors=confidence_factors
                )
                repo.upsert_explanation(expl)

                existing_outcome = repo.get_outcome(rec_id)
                if not existing_outcome:
                    out = RecommendationOutcome(
                        recommendation_id=rec_id,
                        status="active",
                        action_taken_at=datetime.now(timezone.utc)
                    )
                    repo.upsert_outcome(out)

                # Invalidate Cache
                from app.core.redis import invalidate_org_recommendations
                invalidate_org_recommendations(str(org.id))

                # Downstream intelligence pipeline update
                update_financial_intelligence_pipeline(session, org.id)
                
            logger.info(f"AI Recommendation materialization completed: state={rec_state} rules_matched={list(rules_matched.keys())}")


def update_financial_intelligence_pipeline(session: Session, org_id: uuid.UUID) -> None:
    """Task 4: Automatic downstream updates for outcomes, portfolio intelligence, health, and dashboard."""
    from app.core.redis import (
        cache_intelligence_dashboard,
        cache_intelligence_health,
        cache_intelligence_outcomes,
        cache_intelligence_portfolio,
        cache_intelligence_recommendations,
    )
    from app.domain.entities.market import LatestQuote
    from app.domain.entities.portfolio import Portfolio, Transaction
    from app.domain.entities.recommendation import Recommendation, RecommendationOutcome
    from app.domain.entities.system import OrganizationMember
    from app.domain.services.intelligence import FinancialIntelligenceService
    from app.domain.services.recommendation import serialize_recommendation
    
    intel_svc = FinancialIntelligenceService(session)
    
    # 1. Outcome Updates
    applied_outcomes = (
        session.query(RecommendationOutcome)
        .join(Recommendation, Recommendation.id == RecommendationOutcome.recommendation_id)
        .filter(Recommendation.organization_id == org_id)
        .filter(RecommendationOutcome.status == "applied")
        .all()
    )
    for o in applied_outcomes:
        rec = session.query(Recommendation).filter(Recommendation.id == o.recommendation_id).first()
        if not rec:
            continue
        p0 = None
        if o.ledger_transaction_id:
            txn = session.query(Transaction).filter(Transaction.id == o.ledger_transaction_id).first()
            if txn:
                p0 = float(txn.price)
        if p0 is None:
            p0 = intel_svc._get_asset_price_at_time(rec.asset_id, rec.created_at)
            
        quote = session.query(LatestQuote).filter(LatestQuote.asset_id == rec.asset_id).first()
        p_current = float(quote.price) if quote and quote.price is not None else p0
        
        raw_return = (p_current - p0) / p0 if p0 > 0 else 0.0
        realized_impact = -raw_return if rec.recommendation_state in ["REDUCE", "AVOID"] else raw_return
        o.realized_impact = realized_impact
        
    session.commit()
    
    # 2. Portfolio Intelligence, Financial Health, and Dashboard Cache
    portfolios = session.query(Portfolio).filter(Portfolio.organization_id == org_id).all()
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
        health = intel_svc.get_investor_health_score(portfolio_id, org_id)
        cache_intelligence_health(pid_str, health)
        
        # Cache Recommendations
        recs = session.query(Recommendation).filter(Recommendation.organization_id == org_id).all()
        serialized_recs = [serialize_recommendation(r, session) for r in recs]
        cache_intelligence_recommendations(pid_str, serialized_recs)
        
        # Cache Outcomes
        quality_metrics = intel_svc.get_recommendation_quality_metrics(org_id)
        performance = intel_svc.get_recommendation_performance(org_id)
        outcomes_data = {
            "quality_metrics": quality_metrics,
            "performance": performance
        }
        cache_intelligence_outcomes(pid_str, outcomes_data)
        
        # 3. Dashboard Cache
        member = session.query(OrganizationMember).filter(OrganizationMember.organization_id == org_id).first()
        user_id = member.user_id if member else uuid.UUID("00000000-0000-0000-0000-000000000000")
        
        dashboard = intel_svc.get_dashboard_aggregation(portfolio_id, org_id, user_id)
        cache_intelligence_dashboard(str(org_id), dashboard)



import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_current_user,
    get_db,
    get_intelligence_service,
    get_members_repo,
    get_recommendation_service,
)
from app.core.redis import (
    cache_intelligence_dashboard,
    cache_intelligence_health,
    cache_intelligence_outcomes,
    cache_intelligence_portfolio,
    cache_intelligence_recommendations,
    get_cached_intelligence_dashboard,
    get_cached_intelligence_health,
    get_cached_intelligence_outcomes,
    get_cached_intelligence_portfolio,
    get_cached_intelligence_recommendations,
)
from app.domain.entities.portfolio import Portfolio
from app.domain.entities.system import User
from app.domain.services import FinancialIntelligenceService, RecommendationService
from app.infrastructure.repositories import OrganizationMembersRepository

router = APIRouter()

# --- Authorization Helpers ---

def check_org_read_access(org_id: uuid.UUID, user_id: uuid.UUID, members_repo: OrganizationMembersRepository):
    membership = members_repo.get_by_org_and_user(org_id, user_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Not authorized to access this organization")
    return membership

def get_org_id_for_portfolio(portfolio_id: uuid.UUID, db: Session) -> uuid.UUID:
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio.organization_id

# --- Endpoints ---

@router.get("/recommendations")
def get_recommendations(
    portfolio_id: uuid.UUID = Query(..., description="Target portfolio ID"),
    status: Optional[str] = Query(None, description="Filter by status (active, applied, dismissed)"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    db: Session = Depends(get_db),
    rec_service: RecommendationService = Depends(get_recommendation_service),
):
    org_id = get_org_id_for_portfolio(portfolio_id, db)
    check_org_read_access(org_id, current_user.id, members_repo)
    
    # Check cache
    cached = get_cached_intelligence_recommendations(str(portfolio_id))
    if cached is not None:
        if status:
            return [r for r in cached if r.get("status") == status]
        return cached

    # Compute
    recs = rec_service.get_recommendations(org_id)
    cache_intelligence_recommendations(str(portfolio_id), recs)
    
    if status:
        return [r for r in recs if r.get("status") == status]
    return recs


@router.get("/recommendations/{recommendation_id}")
def get_recommendation_by_id(
    recommendation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    db: Session = Depends(get_db),
    rec_service: RecommendationService = Depends(get_recommendation_service),
):
    # Retrieve recommendation to check org read access
    from app.domain.entities.recommendation import Recommendation
    rec = db.query(Recommendation).filter(Recommendation.id == recommendation_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found")
        
    check_org_read_access(rec.organization_id, current_user.id, members_repo)
    
    from app.domain.services.recommendation import serialize_recommendation
    return serialize_recommendation(rec, db)


@router.get("/outcomes")
def get_outcomes(
    portfolio_id: uuid.UUID = Query(..., description="Target portfolio ID"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    db: Session = Depends(get_db),
    intel_service: FinancialIntelligenceService = Depends(get_intelligence_service),
):
    org_id = get_org_id_for_portfolio(portfolio_id, db)
    check_org_read_access(org_id, current_user.id, members_repo)

    cached = get_cached_intelligence_outcomes(str(portfolio_id))
    if cached is not None:
        return cached

    quality_metrics = intel_service.get_recommendation_quality_metrics(org_id)
    performance = intel_service.get_recommendation_performance(org_id)
    
    data = {
        "quality_metrics": quality_metrics,
        "performance": performance
    }
    cache_intelligence_outcomes(str(portfolio_id), data)
    return data


@router.get("/calibration")
def get_calibration(
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    intel_service: FinancialIntelligenceService = Depends(get_intelligence_service),
):
    check_org_read_access(org_id, current_user.id, members_repo)
    return intel_service.get_confidence_calibration(org_id)


@router.get("/portfolio-health")
def get_portfolio_health(
    portfolio_id: uuid.UUID = Query(..., description="Portfolio ID"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    db: Session = Depends(get_db),
    intel_service: FinancialIntelligenceService = Depends(get_intelligence_service),
):
    org_id = get_org_id_for_portfolio(portfolio_id, db)
    check_org_read_access(org_id, current_user.id, members_repo)

    cached = get_cached_intelligence_health(str(portfolio_id))
    if cached is not None:
        return cached

    health = intel_service.get_investor_health_score(portfolio_id, org_id)
    cache_intelligence_health(str(portfolio_id), health)
    return health


@router.get("/diversification")
def get_diversification(
    portfolio_id: uuid.UUID = Query(..., description="Portfolio ID"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    db: Session = Depends(get_db),
    intel_service: FinancialIntelligenceService = Depends(get_intelligence_service),
):
    org_id = get_org_id_for_portfolio(portfolio_id, db)
    check_org_read_access(org_id, current_user.id, members_repo)

    # Use portfolio cache to store diversification/concentration/cash-opportunities combined or separately
    # Let's check portfolio cache key
    cached = get_cached_intelligence_portfolio(str(portfolio_id))
    if cached is not None and "diversification" in cached:
        return cached["diversification"]

    div = intel_service.get_portfolio_diversification_score(portfolio_id)
    
    # Update portfolio cache
    portfolio_data = cached or {}
    portfolio_data["diversification"] = div
    cache_intelligence_portfolio(str(portfolio_id), portfolio_data)
    
    return div


@router.get("/concentration")
def get_concentration(
    portfolio_id: uuid.UUID = Query(..., description="Portfolio ID"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    db: Session = Depends(get_db),
    intel_service: FinancialIntelligenceService = Depends(get_intelligence_service),
):
    org_id = get_org_id_for_portfolio(portfolio_id, db)
    check_org_read_access(org_id, current_user.id, members_repo)

    cached = get_cached_intelligence_portfolio(str(portfolio_id))
    if cached is not None and "concentration" in cached:
        return cached["concentration"]

    conc = intel_service.get_portfolio_concentration_analysis(portfolio_id)
    
    portfolio_data = cached or {}
    portfolio_data["concentration"] = conc
    cache_intelligence_portfolio(str(portfolio_id), portfolio_data)
    
    return conc


@router.get("/goals")
def get_goals(
    portfolio_id: uuid.UUID = Query(..., description="Portfolio ID"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    db: Session = Depends(get_db),
    intel_service: FinancialIntelligenceService = Depends(get_intelligence_service),
):
    org_id = get_org_id_for_portfolio(portfolio_id, db)
    check_org_read_access(org_id, current_user.id, members_repo)
    return intel_service.get_goal_progress_metrics(portfolio_id, org_id, current_user.id)


@router.get("/cash-opportunities")
def get_cash_opportunities(
    portfolio_id: uuid.UUID = Query(..., description="Portfolio ID"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    db: Session = Depends(get_db),
    intel_service: FinancialIntelligenceService = Depends(get_intelligence_service),
):
    org_id = get_org_id_for_portfolio(portfolio_id, db)
    check_org_read_access(org_id, current_user.id, members_repo)

    cached = get_cached_intelligence_portfolio(str(portfolio_id))
    if cached is not None and "cash_opportunities" in cached:
        return cached["cash_opportunities"]

    cash = intel_service.get_cash_deployment_opportunities(portfolio_id)
    
    portfolio_data = cached or {}
    portfolio_data["cash_opportunities"] = cash
    cache_intelligence_portfolio(str(portfolio_id), portfolio_data)
    
    return cash


@router.get("/dashboard")
def get_dashboard(
    portfolio_id: uuid.UUID = Query(..., description="Portfolio ID"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    db: Session = Depends(get_db),
    intel_service: FinancialIntelligenceService = Depends(get_intelligence_service),
):
    org_id = get_org_id_for_portfolio(portfolio_id, db)
    check_org_read_access(org_id, current_user.id, members_repo)

    # Check cache for dashboard using org_id
    cached = get_cached_intelligence_dashboard(str(org_id))
    if cached is not None:
        return cached

    dashboard = intel_service.get_dashboard_aggregation(portfolio_id, org_id, current_user.id)
    cache_intelligence_dashboard(str(org_id), dashboard)
    return dashboard


# --- Trend Endpoints (Task 8) ---

@router.get("/portfolio-health/trend")
def get_health_trend(
    portfolio_id: uuid.UUID = Query(..., description="Portfolio ID"),
    days: int = Query(30, description="Number of historical days"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    db: Session = Depends(get_db),
    intel_service: FinancialIntelligenceService = Depends(get_intelligence_service),
):
    org_id = get_org_id_for_portfolio(portfolio_id, db)
    check_org_read_access(org_id, current_user.id, members_repo)
    return intel_service.get_portfolio_health_trend(portfolio_id, org_id, days)


@router.get("/diversification/trend")
def get_diversification_trend(
    portfolio_id: uuid.UUID = Query(..., description="Portfolio ID"),
    days: int = Query(30, description="Number of historical days"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    db: Session = Depends(get_db),
    intel_service: FinancialIntelligenceService = Depends(get_intelligence_service),
):
    org_id = get_org_id_for_portfolio(portfolio_id, db)
    check_org_read_access(org_id, current_user.id, members_repo)
    return intel_service.get_diversification_trend(portfolio_id, days)


@router.get("/recommendations/performance/trend")
def get_recommendations_trend(
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    days: int = Query(30, description="Number of historical days"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    intel_service: FinancialIntelligenceService = Depends(get_intelligence_service),
):
    check_org_read_access(org_id, current_user.id, members_repo)
    return intel_service.get_recommendation_performance_trend(org_id, days)


@router.get("/goals/trend")
def get_goals_trend(
    portfolio_id: uuid.UUID = Query(..., description="Portfolio ID"),
    days: int = Query(30, description="Number of historical days"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    db: Session = Depends(get_db),
    intel_service: FinancialIntelligenceService = Depends(get_intelligence_service),
):
    org_id = get_org_id_for_portfolio(portfolio_id, db)
    check_org_read_access(org_id, current_user.id, members_repo)
    return intel_service.get_goal_progress_trend(portfolio_id, org_id, current_user.id, days)

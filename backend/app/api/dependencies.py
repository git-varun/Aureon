from typing import Generator

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.constants import DEFAULT_USER_ID
from app.core.database import SessionLocal
from app.domain.entities.system import User
from app.domain.services import (
    AIService,
    ConfigService,
    FinancialIntelligenceService,
    NewsService,
    NotificationService,
    PortfolioService,
    RecommendationService,
    WatchlistService,
)
from app.domain.services.assets import AssetsService
from app.domain.services.evaluation import EvaluationService
from app.domain.services.market import MarketService
from app.domain.services.monitoring import MonitoringService
from app.infrastructure.repositories import (
    AssetHealthRepository,
    AssetScoresRepository,
    AssetsRepository,
    ConfigRepository,
    MarketRepository,
    MonitoringRepository,
    NewsRepository,
    PortfolioSnapshotRepository,
    PortfoliosRepository,
    PositionsRepository,
    RecommendationRepository,
    TransactionsRepository,
    UsersRepository,
    WatchlistsRepository,
    WebNotificationsRepository,
)


# Database session dependency
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Repository dependencies
def get_users_repo(db: Session = Depends(get_db)) -> UsersRepository:
    return UsersRepository(db)

def get_portfolios_repo(db: Session = Depends(get_db)) -> PortfoliosRepository:
    return PortfoliosRepository(db)

def get_transactions_repo(db: Session = Depends(get_db)) -> TransactionsRepository:
    return TransactionsRepository(db)

def get_positions_repo(db: Session = Depends(get_db)) -> PositionsRepository:
    return PositionsRepository(db)

def get_portfolio_snapshot_repo(db: Session = Depends(get_db)) -> PortfolioSnapshotRepository:
    return PortfolioSnapshotRepository(db)

# Service dependencies
def get_portfolio_service(
    portfolios_repo: PortfoliosRepository = Depends(get_portfolios_repo),
    transactions_repo: TransactionsRepository = Depends(get_transactions_repo),
    positions_repo: PositionsRepository = Depends(get_positions_repo),
    snapshot_repo: PortfolioSnapshotRepository = Depends(get_portfolio_snapshot_repo),
) -> PortfolioService:
    return PortfolioService(portfolios_repo, transactions_repo, positions_repo, snapshot_repo)

def get_recommendation_repo(db: Session = Depends(get_db)) -> RecommendationRepository:
    return RecommendationRepository(db)

def get_recommendation_service(db: Session = Depends(get_db)) -> RecommendationService:
    return RecommendationService(db)

def get_intelligence_service(db: Session = Depends(get_db)) -> FinancialIntelligenceService:
    return FinancialIntelligenceService(db)

def get_watchlist_repo(db: Session = Depends(get_db)) -> WatchlistsRepository:
    return WatchlistsRepository(db)

def get_config_repo(db: Session = Depends(get_db)) -> ConfigRepository:
    return ConfigRepository(db)

def get_notification_repo(db: Session = Depends(get_db)) -> WebNotificationsRepository:
    return WebNotificationsRepository(db)

def get_news_repo(db: Session = Depends(get_db)) -> NewsRepository:
    return NewsRepository(db)

def get_watchlist_service(repo: WatchlistsRepository = Depends(get_watchlist_repo)) -> WatchlistService:
    return WatchlistService(repo)

def get_config_service(repo: ConfigRepository = Depends(get_config_repo)) -> ConfigService:
    return ConfigService(repo)

def get_notification_service(repo: WebNotificationsRepository = Depends(get_notification_repo)) -> NotificationService:
    return NotificationService(repo)

def get_market_repo(db: Session = Depends(get_db)) -> MarketRepository:
    return MarketRepository(db)

def get_market_service(repo: MarketRepository = Depends(get_market_repo)) -> MarketService:
    return MarketService(repo)

def get_assets_repo(db: Session = Depends(get_db)) -> AssetsRepository:
    return AssetsRepository(db)

def get_assets_service(
    repo: AssetsRepository = Depends(get_assets_repo),
    market_svc: MarketService = Depends(get_market_service),
) -> AssetsService:
    return AssetsService(repo, market_svc)

def get_monitoring_repo(db: Session = Depends(get_db)) -> MonitoringRepository:
    return MonitoringRepository(db)

def get_asset_health_repo(db: Session = Depends(get_db)) -> AssetHealthRepository:
    return AssetHealthRepository(db)

def get_monitoring_service(
    repo: MonitoringRepository = Depends(get_monitoring_repo),
    asset_health_repo: AssetHealthRepository = Depends(get_asset_health_repo),
) -> MonitoringService:
    return MonitoringService(repo, asset_health_repo)

def get_news_service(repo: NewsRepository = Depends(get_news_repo)) -> NewsService:
    return NewsService(repo)

def get_asset_scores_repo(db: Session = Depends(get_db)) -> AssetScoresRepository:
    return AssetScoresRepository(db)

def get_evaluation_service(repo: AssetScoresRepository = Depends(get_asset_scores_repo)) -> EvaluationService:
    return EvaluationService(repo)


# Single-user identity: no login, no sessions. This resolves-or-creates the one
# canonical User row (keyed by DEFAULT_USER_ID) so existing scoping/audit call sites
# that expect a User object keep working unchanged.
def get_current_user(
    users_repo: UsersRepository = Depends(get_users_repo),
) -> User:
    user = users_repo.get_by_id(DEFAULT_USER_ID)
    if not user:
        user = User(id=DEFAULT_USER_ID, email="local@aureon.app", is_active=True)
        user = users_repo.create(user)
        users_repo.session.commit()
    return user

def get_ai_service(db: Session = Depends(get_db)) -> AIService:
    return AIService(db)


def get_user_context(db: Session, user: User):
    """Resolves or creates the default Portfolio context on the fly."""
    from app.domain.entities.portfolio import Portfolio

    portfolio = db.query(Portfolio).first()
    if not portfolio:
        portfolio = Portfolio(name="Default Portfolio")
        db.add(portfolio)
        db.flush()

    db.commit()
    return portfolio.id


def serialize_user_profile(user: User, db: Session) -> dict:
    from app.domain.entities.market import MarketTheme, ThemeWeight
    from app.domain.entities.system import UserPreference

    # Query preference
    pref = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    if not pref:
        pref = UserPreference(
            user_id=user.id,
            risk_profile="moderate",
            target_profit_pct=12.0,
            monthly_saving=25000.0,
            working_area=None,
            swing_trading_enabled=True,
            bio=None
        )
        db.add(pref)
        db.commit()
        db.refresh(pref)

    # Query custom themes
    themes = db.query(MarketTheme).filter(MarketTheme.owner_id == user.id).all()
    custom_themes = {}
    for t in themes:
        # Query weights for this theme
        weights = db.query(ThemeWeight).filter(ThemeWeight.theme_id == t.theme_id).all()
        w_dict = {w.symbol: float(w.weight) for w in weights}

        custom_themes[t.theme_id] = {
            "id": t.theme_id,
            "name": t.name,
            "desc": t.desc,
            "symbols": t.symbols,
            "weights": w_dict,
            "inception_date": t.inception_date,
            "ret1m": float(t.ret1m),
            "count": len(t.symbols),
            "owner_id": str(user.id),
            "forked_from": t.forked_from
        }

    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone": user.phone,
        "bio": pref.bio,
        "risk_profile": pref.risk_profile,
        "working_area": pref.working_area,
        "target_profit_pct": float(pref.target_profit_pct) if pref.target_profit_pct is not None else 12.0,
        "monthly_saving": float(pref.monthly_saving) if pref.monthly_saving is not None else 25000.0,
        "swing_trading_enabled": pref.swing_trading_enabled,
        "profile_picture": user.profile_picture,
        "custom_themes": custom_themes
    }


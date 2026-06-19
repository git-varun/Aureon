from datetime import datetime, timezone
from typing import Generator

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.domain.entities.system import User, UserSession
from app.domain.services import (
    AIService,
    AuthService,
    ConfigService,
    FinancialIntelligenceService,
    NewsService,
    NotificationService,
    OrganizationService,
    PortfolioService,
    RecommendationService,
    WatchlistService,
)
from app.infrastructure.repositories import (
    ConfigRepository,
    InvitationsRepository,
    NewsRepository,
    OrganizationMembersRepository,
    OrganizationsRepository,
    PortfolioSnapshotRepository,
    PortfoliosRepository,
    PositionsRepository,
    RecommendationRepository,
    SessionsRepository,
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

def get_sessions_repo(db: Session = Depends(get_db)) -> SessionsRepository:
    return SessionsRepository(db)

def get_invitations_repo(db: Session = Depends(get_db)) -> InvitationsRepository:
    return InvitationsRepository(db)

def get_orgs_repo(db: Session = Depends(get_db)) -> OrganizationsRepository:
    return OrganizationsRepository(db)

def get_members_repo(db: Session = Depends(get_db)) -> OrganizationMembersRepository:
    return OrganizationMembersRepository(db)

def get_portfolios_repo(db: Session = Depends(get_db)) -> PortfoliosRepository:
    return PortfoliosRepository(db)

def get_transactions_repo(db: Session = Depends(get_db)) -> TransactionsRepository:
    return TransactionsRepository(db)

def get_positions_repo(db: Session = Depends(get_db)) -> PositionsRepository:
    return PositionsRepository(db)

def get_portfolio_snapshot_repo(db: Session = Depends(get_db)) -> PortfolioSnapshotRepository:
    return PortfolioSnapshotRepository(db)

# Service dependencies
def get_auth_service(
    users_repo: UsersRepository = Depends(get_users_repo),
    sessions_repo: SessionsRepository = Depends(get_sessions_repo),
    invitations_repo: InvitationsRepository = Depends(get_invitations_repo),
    orgs_repo: OrganizationsRepository = Depends(get_orgs_repo),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
) -> AuthService:
    return AuthService(users_repo, sessions_repo, invitations_repo, orgs_repo, members_repo)

def get_org_service(
    orgs_repo: OrganizationsRepository = Depends(get_orgs_repo),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    invitations_repo: InvitationsRepository = Depends(get_invitations_repo),
    users_repo: UsersRepository = Depends(get_users_repo),
) -> OrganizationService:
    return OrganizationService(orgs_repo, members_repo, invitations_repo, users_repo)

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

def get_news_service(repo: NewsRepository = Depends(get_news_repo)) -> NewsService:
    return NewsService(repo)


# Security/Authentication dependencies
def get_current_session(
    authorization: str | None = Header(None, description="Bearer token"),
    sessions_repo: SessionsRepository = Depends(get_sessions_repo),
) -> UserSession:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header. Expected Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = authorization.split(" ", 1)[1]
    session_rec = sessions_repo.get_by_token(token)
    if not session_rec:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session not found or invalid",
        )
        
    if session_rec.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        sessions_repo.delete_by_token(token)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired",
        )
        
    return session_rec

def get_current_user(
    session: UserSession = Depends(get_current_session),
    users_repo: UsersRepository = Depends(get_users_repo),
) -> User:
    user = users_repo.get_by_id(session.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with this session no longer exists",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive",
        )
    return user

def get_ai_service(db: Session = Depends(get_db)) -> AIService:
    return AIService(db)


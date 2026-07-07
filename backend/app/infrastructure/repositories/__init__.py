from app.modules.market.repositories.asset_health import AssetHealthRepository
from app.modules.market.repositories.asset_scores import AssetScoresRepository
from app.modules.market.repositories.assets import AssetsRepository
from app.core.repositories.config import ConfigRepository
from app.modules.market.repositories.market import MarketRepository
from app.core.repositories.monitoring import MonitoringRepository
from app.modules.news.repositories.news import NewsRepository
from app.core.repositories.notification import WebNotificationsRepository
from app.modules.portfolio.repositories.portfolio_snapshot import (
    PortfolioSnapshotRepository,
)
from app.modules.portfolio.repositories.portfolios import PortfoliosRepository
from app.modules.portfolio.repositories.positions import PositionsRepository
from app.modules.ai.repositories.recommendation import RecommendationRepository
from app.modules.portfolio.repositories.transactions import TransactionsRepository
from app.core.repositories.users import UsersRepository
from app.modules.market.repositories.watchlist import WatchlistsRepository


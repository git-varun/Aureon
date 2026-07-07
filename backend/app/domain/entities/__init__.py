from app.modules.ai.entities.ai import AIBriefing, AIEvaluation, AIFeedback, AIGeneration
from app.core.entities.base import Base
from app.core.entities.config import (
    AllocationTarget,
    JobConfig,
    JobLog,
    JobStatus,
    ProviderConfig,
)
from app.modules.market.entities.evaluation import AssetScore, FeatureSnapshot
from app.modules.market.entities.market import (
    Asset,
    AssetFeatures,
    AssetHealth,
    AssetSnapshot,
    LatestQuote,
    MarketTheme,
    PriceHistory,
    ThemeWeight,
)
from app.modules.news.entities.news import AssetSentimentSnapshot, News, NewsAsset
from app.core.entities.notification import WebNotification
from app.modules.portfolio.entities.portfolio import (
    Portfolio,
    PortfolioSnapshot,
    Position,
    Transaction,
)
from app.modules.ai.entities.recommendation import (
    Recommendation,
    RecommendationExplanation,
    RecommendationOutcome,
)
from app.core.entities.system import (
    AuditLog,
    FailedIngestion,
    JobRun,
    Provider,
    ProviderUsage,
    User,
    UserPreference,
)
from app.modules.market.entities.watchlist import Watchlist, WatchlistSymbol



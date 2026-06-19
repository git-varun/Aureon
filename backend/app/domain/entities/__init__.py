from app.domain.entities.ai import AIBriefing, AIEvaluation, AIFeedback, AIGeneration
from app.domain.entities.base import Base
from app.domain.entities.config import (
    AllocationTarget,
    JobConfig,
    JobLog,
    JobStatus,
    ProviderConfig,
)
from app.domain.entities.evaluation import AssetScore, FeatureSnapshot
from app.domain.entities.market import (
    Asset,
    AssetFeatures,
    AssetHealth,
    AssetSnapshot,
    LatestQuote,
    MarketTheme,
    PriceHistory,
    ThemeWeight,
)
from app.domain.entities.news import AssetSentimentSnapshot, News, NewsAsset
from app.domain.entities.notification import WebNotification
from app.domain.entities.portfolio import (
    Portfolio,
    PortfolioSnapshot,
    Position,
    Transaction,
)
from app.domain.entities.recommendation import (
    Recommendation,
    RecommendationExplanation,
    RecommendationOutcome,
)
from app.domain.entities.system import (
    AuditLog,
    FailedIngestion,
    Invitation,
    JobRun,
    Organization,
    OrganizationMember,
    Provider,
    ProviderUsage,
    User,
    UserPreference,
    UserSession,
)
from app.domain.entities.watchlist import Watchlist, WatchlistSymbol



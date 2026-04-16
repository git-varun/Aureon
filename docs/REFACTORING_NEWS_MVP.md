# News Module MVP Refactoring - Documentation

## 🎯 Overview

The Investment OS news module has been refactored to implement MVP architecture with support for multiple news providers. This maintains a clean, simple data flow: **Cron → Task → Service → Database**.

## 📁 Module Structure

```
app/modules/news/
├── models.py                      # News ORM model
├── services.py                    # NewsService (multi-provider support)
├── routes.py                      # GET endpoints only
├── schemas.py                     # Pydantic validation models
├── news_engine.py                 # Sentiment analysis (unchanged)
├── providers/
│   ├── base.py                    # BaseNewsProvider abstract class
│   ├── rss_provider.py            # RSS feeds (Google, Yahoo Finance)
│   ├── finnhub.py                 # Finnhub API (real-time news)
│   ├── newsapi.py                 # NewsAPI (general market news)
│   ├── alphavantage.py            # Alpha Vantage (company news)
│   └── registry.py                # Provider registry & management
```

## 🔄 Data Flow

```
┌────────────────────────────────────────────┐
│ Cron Job (8 AM daily)                      │
└────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────┐
│ Celery Task: fetch_news_task               │
│ • Resolves symbols (portfolio or explicit) │
│ • Creates NewsService instance            │
└────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────┐
│ NewsService.fetch_and_store()              │
│ • Gets ProviderRegistry                    │
│ • Fetches from all enabled providers:      │
│   - RSSNewsProvider                        │
│   - FinnhubNewsProvider                    │
│   - NewsAPIProvider                        │
│   - AlphaVantageNewsProvider               │
│ • Deduplicates articles by URL             │
│ • Stores with source attribution           │
└────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────┐
│ Database (News table)                      │
│ • Articles stored with source field        │
│ • Unique URL constraint prevents dupes     │
└────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────┐
│ Frontend GET requests                      │
│ • GET /api/news                            │
│ • GET /api/news/{symbol}                   │
│ • Returns grouped/filtered articles        │
└────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────┐
│ NewsFeed.jsx component                     │
│ • Displays articles in masonry grid        │
│ • Shows sentiment badges                   │
│ • Allows "Analyze" for pending articles    │
└────────────────────────────────────────────┘
```

## 🔌 News Providers

### 1. RSS Provider (Always Active)
- **Status**: Active, free
- **Sources**: Google Finance, Yahoo Finance
- **Articles per symbol**: ~20
- **API Key**: Not required

### 2. Finnhub Provider
- **Status**: Active if `FINNHUB_API_KEY` set
- **Type**: Real-time company news
- **Articles per symbol**: ~10
- **API Key**: Required (`FINNHUB_API_KEY`)
- **URL**: https://finnhub.io/api/v1/company-news

### 3. NewsAPI Provider
- **Status**: Active if `NEWSAPI_API_KEY` set
- **Type**: General market news aggregation
- **Articles per symbol**: ~20
- **API Key**: Required (`NEWSAPI_API_KEY`)
- **URL**: https://newsapi.org/v2/everything

### 4. AlphaVantage Provider
- **Status**: Active if `ALPHAVANTAGE_API_KEY` set
- **Type**: Company-specific news with sentiment
- **Articles per symbol**: ~20
- **API Key**: Required (`ALPHAVANTAGE_API_KEY`)
- **URL**: https://www.alphavantage.co/query

## 📝 API Endpoints

### GET /api/news
Returns all recent news articles grouped by symbol.

**Response Example:**
```json
{
  "AAPL": [
    {
      "id": 1,
      "title": "Apple Q3 Earnings Beat Expectations",
      "summary": "...",
      "source": "finnhub",
      "url": "https://...",
      "symbols": "AAPL",
      "published_at": "2026-04-16T10:30:00+00:00",
      "sentiment_score": 0.85
    }
  ],
  "MSFT": [...]
}
```

### GET /api/news/{symbol}
Returns recent news for a specific symbol (limit: 10 articles).

**Response Example:**
```json
[
  {
    "id": 1,
    "title": "Microsoft Launches New AI Suite",
    "summary": "...",
    "source": "newsapi",
    "url": "https://...",
    "symbols": "MSFT",
    "published_at": "2026-04-15T14:20:00+00:00",
    "sentiment_score": 0.75
  }
]
```

### GET /api/news/health
Health check for news module.

**Response:**
```json
{"module": "news", "status": "ok"}
```

## 🔧 Configuration

### Environment Variables (.env)
```env
# Optional: Add API keys for additional providers
FINNHUB_API_KEY=pk_your_finnhub_key
NEWSAPI_API_KEY=your_newsapi_key
ALPHAVANTAGE_API_KEY=your_alphavantage_key
```

### Python Configuration (app/core/config.py)
```python
class Settings(BaseSettings):
    # News providers
    finnhub_api_key: str = ""
    newsapi_api_key: str = ""
    alphavantage_api_key: str = ""
```

## 🏗️ Architecture Patterns

### 1. Provider Abstraction
All providers inherit from `BaseNewsProvider`:

```python
class BaseNewsProvider(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @abstractmethod
    def fetch_headlines(self, symbol: str) -> List[NewsPayload]:
        pass
```

### 2. Registry Pattern
`ProviderRegistry` manages provider lifecycle:

```python
# Default registry with RSS, Finnhub, NewsAPI enabled
registry = get_default_registry()
providers = registry.get_providers()  # Returns active instances
registry.is_enabled("finnhub")        # Check if provider is active
```

### 3. Service Layer
`NewsService` orchestrates multi-provider fetching:

```python
service = NewsService()
count = service.fetch_and_store("AAPL", db_session)
# Fetches from all providers, deduplicates, stores to DB
# Returns: number of new articles inserted
```

### 4. Graceful Degradation
Missing API keys don't crash the system:

```python
# If FINNHUB_API_KEY not set:
provider = FinnhubNewsProvider()
# Silently skips, returns empty list
headlines = provider.fetch_headlines("AAPL")  # → []
```

## 🛠️ Task Execution

### Daily Pipeline (9 AM Mon-Fri)
Orchestrated by `PipelineOrchestrator.run_daily_pipeline()`:

```
Step 1: refresh_prices_task
Step 2: enrich_technicals_task (per-asset)
Step 3: generate_signals_task
Step 4: fetch_news_task         ← NEWS FETCH (multi-provider)
Step 5: news_sentiment_task     ← AI SENTIMENT ANALYSIS
Step 6: global_briefing_task
```

### Direct Task Call
```python
from app.tasks.news import fetch_news_task

# Fetch for all portfolio symbols
result = fetch_news_task.delay()

# Fetch for specific symbols
result = fetch_news_task.delay(symbols=['AAPL', 'MSFT', 'GOOGL'])
```

## 📊 Data Model

### News Table Schema
```sql
CREATE TABLE news (
    id INTEGER PRIMARY KEY,
    title VARCHAR NOT NULL,
    content TEXT,
    summary TEXT,
    source VARCHAR NOT NULL,           -- 'rss', 'finnhub', 'newsapi', 'alphavantage'
    url VARCHAR UNIQUE,
    published_at TIMESTAMP WITH TIMEZONE,
    sentiment_score FLOAT,             -- -1 to 1 (populated by AI task)
    relevance_score FLOAT,             -- 0 to 1 (for future use)
    symbols VARCHAR,                   -- comma-separated stock symbols
    created_at TIMESTAMP WITH TIMEZONE
);
```

## 🔍 Debugging

### View Provider Registry
```python
from app.modules.news.providers.registry import get_default_registry
r = get_default_registry()
print("Enabled providers:", r.list_enabled())
# Output: ['rss', 'finnhub', 'newsapi']
```

### Fetch News Manually
```python
from app.modules.news.services import NewsService
from app.core.db import SessionLocal

service = NewsService()
db = SessionLocal()
count = service.fetch_and_store("AAPL", db)
print(f"Fetched {count} new articles")
```

### Check Task Status
```bash
# View Celery tasks
celery -A app.core.celery_app inspect active

# View task logs
tail -f celery_app.log | grep "fetch_news"
```

## ✅ Testing

### Unit Tests (To Add)
- Test each provider separately with mocked APIs
- Test deduplication logic
- Test multi-provider aggregation
- Test service error handling

### Integration Tests (To Add)
- Test full cron → task → service flow
- Test database persistence
- Test API endpoints
- Test frontend integration

## 🚀 Deployment

### Pre-deployment Checklist
- [ ] All API keys configured in `.env`
- [ ] Celery broker configured (or eager mode for dev)
- [ ] PostgreSQL database accessible
- [ ] At least RSS provider works (no API key needed)
- [ ] Cron job scheduled at 8 AM

### Rollout Strategy
1. Deploy code changes
2. Restart Celery workers
3. Restart Celery beat scheduler
4. Monitor first fetch_news_task execution
5. Verify articles appear in database
6. Check frontend renders correctly

## 📈 Performance

### Fetch Time Estimates
- RSS provider: ~5-10 seconds per symbol
- Finnhub: ~1-2 seconds per symbol
- NewsAPI: ~2-3 seconds per symbol
- AlphaVantage: ~2-3 seconds per symbol

### For 100 Symbols (Sequential)
- Total time: ~10-20 minutes
- Recommendations:
  - Run during low-traffic hours (8 AM)
  - Consider parallel fetching for large portfolios
  - Implement connection pooling

## 🔒 Security

### API Key Protection
- Keys stored in environment variables (never in code)
- Keys not logged or displayed in API responses
- Use `.env.example` for documentation (without actual keys)

### Rate Limiting
- Each provider has built-in request limits
- Implement backoff strategy if needed
- Monitor API usage to stay within free tier limits

## 🐛 Known Issues & Limitations

1. **Sequential Provider Fetching**: Providers are called sequentially, not in parallel
   - Fix: Implement ThreadPoolExecutor for concurrent provider calls

2. **No Article Retention Policy**: Old articles stay in database forever
   - Fix: Add cleanup task to delete articles older than 30 days

3. **Relevance Score Unused**: `News.relevance_score` field never populated
   - Fix: Implement relevance scoring based on article metadata

4. **No Rate Limit Handling**: Providers don't implement exponential backoff
   - Fix: Add provider-level rate limit detection and retry logic

## 🎓 Learning Resources

### File Locations
- **Provider Pattern**: `app/modules/news/providers/`
- **Service Pattern**: `app/modules/news/services.py`
- **Task Pattern**: `app/tasks/news.py`
- **API Pattern**: `app/modules/news/routes.py`

### Related Documentation
- See `CLAUDE.md` for module architecture overview
- See `docs/` folder for full API documentation

## 📞 Support

### Troubleshooting

**Q: No articles appear in database**
- Check: Celery worker is running (`celery -A app.core.celery_app worker`)
- Check: Celery beat is running (`celery -A app.core.celery_app beat`)
- Check: Portfolio has Asset symbols defined
- Check: Logs for provider-specific errors

**Q: Only RSS articles, no Finnhub/NewsAPI**
- Check: API keys set in `.env`
- Check: API keys are valid (not expired)
- Check: API rate limits not exceeded
- Check: Network connectivity to provider APIs

**Q: Articles marked as duplicates?**
- This is expected and correct! URL deduplication prevents the same article from appearing multiple times
- Each provider might fetch the same news story

---

**Last Updated**: 2026-04-16
**Status**: Production Ready
**Version**: 1.0 MVP

# Investment OS - Visual Diagrams & Memory Aids

## 🧠 Mental Models (For Retention)

### Model 1: Request Journey (How a request flows through the system)

```
┌─────────────┐
│   Browser   │
│ (Frontend)  │
└──────┬──────┘
       │ HTTP/HTTPS
       ↓
    CORS Check
       │
       ↓
┌──────────────────────────────┐
│  FastAPI Middleware/Routing   │
│  (app/main.py)                │
└──────────┬───────────────────┘
           │
           ├─ Auth Check: JWT token valid?
           │  └─ If invalid → 401 Unauthorized
           │
           ↓
   ┌───────────────────────────┐
   │  Route Handler            │  Path: /api/feature/item
   │  (routes.py)              │
   └───────────┬───────────────┘
               │
        ┌──────┴──────┬───────────┬──────────┐
        │             │           │          │
        ↓             ↓           ↓          ↓
    Get Session  Get Cache  Get User   Validate
    (Database)   (Redis)    (Auth)     Schema
        │             │           │          │
        └──────┬──────┴───────────┴──────────┘
               │
               ↓
       ┌───────────────┐
       │ Service Layer │  Business Logic
       │ (services.py) │  (fetch, filter,
       └───────┬───────┘   aggregate, etc)
               │
        ┌──────┴─────────┬─────────────┐
        │                │             │
        ↓                ↓             ↓
   DB Query          Cache Check    External API
   (Repository)      (Redis)        (Zerodha, etc)
        │                │             │
        └──────┬─────────┴─────────────┘
               │
               ↓
       ┌───────────────┐
       │   Format      │  Convert to Response Schema
       │   Response    │  (schemas.py)
       └───────┬───────┘
               │
               ↓
       ┌───────────────┐
       │  HTTP 200     │  + JSON body
       │  Response     │
       └───────────────┘
               │
               ↓
        ┌──────────────┐
        │   Browser    │
        │   Renders    │
        └──────────────┘
```

### Model 2: Time-Series Data Ingestion

```
               SCHEDULED BY
               CELERY BEAT
                   │
        ┌──────────┴──────────┐
        │                     │
    Every 15 min         Every 24 hrs
    Price refresh        AI briefing
        │                     │
        ↓                     ↓
  ┌──────────────┐      ┌────────────────┐
  │ Fetch from:  │      │ Call Gemini    │
  │ • Zerodha    │      │ or Groq API    │
  │ • Binance    │      │                │
  │ • YFinance   │      └────────┬───────┘
  └──────┬───────┘               │
         │                   CACHE HIT?
         ↓                   ├─ Yes → Return cached
      BATCH                  └─ No → Store + Cache
      INSERT
      into prices              ↓
         │              ┌─────────────┐
         ↓              │ INSERT into │
    CACHE INVALIDATE    │ ai_briefing │
    (expire old)        └─────────────┘
         │
         ↓
    TRIGGER async
    signal calculation
         │
         ↓
    CALCULATE indicators
    (RSI, BB, etc)
         │
         ↓
    INSERT into
    technical_indicators
         │
         ↓
    CACHE results
    (TTL: 1 hour)
```

### Model 3: Error Handling (Always catches AppException)

```
Service Layer raises:
    ├─ ConfigError        → 400 Bad Request
    ├─ ValidationError    → 400 Bad Request
    ├─ NotFoundError      → 404 Not Found
    ├─ ConflictError      → 409 Conflict
    └─ DataFetchError     → 502 Bad Gateway
           │
           ↓
    Global Exception Handler
    (app/main.py)
           │
           ↓
    Return JSON:
    {
      "error": "CODE",
      "message": "User-friendly description"
    }
           │
           ↓
    HTTP Response (400/404/409/502)
           │
           ↓
    Frontend receives error
    Shows user-friendly message
```

---

## 🎨 Entity Relationship Diagram (Simplified)

```
                    ┌─────────────────┐
                    │     USERS       │
                    │  (id, email)    │
                    └────────┬────────┘
                             │
            ┌────────────────┼─────────────────┐
            │                │                 │
            ↓                ↓                 ↓
        ┌────────┐      ┌─────────┐    ┌──────────────┐
        │ TOKENS │      │POSITIONS│    │NOTIFICATIONS│
        └────────┘      └────┬────┘    └──────────────┘
                             │
                      ┌──────┴──────┐
                      │             │
                      ↓             ↓
                    ASSETS     TRANSACTIONS
                      │             │
            ┌─────────┼─────────┐   │
            │         │         │   │
            ↓         ↓         ↓   ↓
         PRICES   SIGNALS    FUNDAMENTALS
            │
            └─→ TECHNICAL_INDICATORS
                      │
                      ↓
                   NEWS (implicit link via symbol)

Global Tables (not linked to users):
├─ JOB_CONFIGS ──→ JOB_LOGS
├─ PROVIDER_CONFIGS
├─ PORTFOLIO_SNAPSHOTS ──→ SNAPSHOT_ASSETS
├─ BACKTESTING_RUNS
├─ ANALYTICS_RESULTS
├─ AI_BRIEFING
└─ TAX_LOTS
```

---

## 📊 Data Volume Estimates (For Capacity Planning)

```
Per User Over 3 Years:
├─ assets               ~50-100 rows
├─ positions            ~100-200 rows (multiple per asset)
├─ transactions         ~1,000-5,000 rows
├─ prices              ~5M rows (price per symbol per 15 min)
├─ signals              ~10K rows (1 per asset per day)
├─ technical_indicators ~5K rows (1 per asset per day)
├─ fundamentals         ~1K rows (quarterly updates)
├─ news                 ~100K rows (10-50 per day)
├─ notifications        ~10K rows (few per day)
└─ job_logs             ~1K rows

Total per user: ~125 MB (mostly time-series data)

For 1000 concurrent users:
├─ PostgreSQL: 125 GB
├─ Redis cache: 10-20 GB (short-lived)
└─ RabbitMQ queue: Variable (clears hourly)

For sharding strategy:
├─ By user_id (horizontal scaling)
└─ By timestamp (partition prices table monthly)
```

---

## 🔄 Module Dependency Graph

```
┌────────────────────────────────────────────────────────────┐
│                  CORE INFRASTRUCTURE                        │
│  (config, db, cache, logger, security, dependencies)       │
└────────┬───────────────────────────────────────────────────┘
         │ (all modules depend on core)
         ↓
┌────────────────────────────────────────────────────────────┐
│               FEATURE MODULES                               │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   USERS      │  │   PORTFOLIO  │  │   ASSETS     │     │
│  │  (root User) │  │  (core data) │  │  (syncs)     │     │
│  └──────────────┘  └──────┬───────┘  └──────────────┘     │
│                           │                                 │
│  ┌──────────────┐  ┌──────┴──────┐  ┌──────────────┐     │
│  │   AUTH       │←─┤  ANALYTICS  │→─┤   SIGNALS    │     │
│  │  (JWT login) │  │  (calc data)│  │  (AI + tech) │     │
│  └──────────────┘  └──────┬──────┘  └──────────────┘     │
│                           │                                 │
│  ┌──────────────┐  ┌──────┴──────┐  ┌──────────────┐     │
│  │   PIPELINE   │←─┤   CONFIG    │→─┤   JOBS       │     │
│  │  (scheduler) │  │  (provider) │  │  (execution) │     │
│  └──────┬───────┘  └─────────────┘  └──────────────┘     │
│         │                                                   │
│  ┌──────┴───────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   TASKS      │←─┤    NEWS      │→─┤NOTIFICATION │     │
│  │  (async)     │  │  (sentiment) │  │  (alerts)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │BACKTESTING   │  │TRANSACTIONS  │                        │
│  │  (strategy)  │  │  (history)   │                        │
│  └──────────────┘  └──────────────┘                        │
└────────────────────────────────────────────────────────────┘
```

---

## ⏰ Event Timeline (Daily IST)

```
07:00 IST    Morning AI Briefing
             └─ Gemini/Groq API call
             └─ INSERT ai_briefing table
             └─ Cache for 24 hours

09:00 IST    Market opens (weekdays)
             └─ Daily pipeline trigger
             └─ Portfolio sync (Zerodha, Binance)
             └─ Calculate EOD indicators
             └─ Generate signals

09:00-15:30  Market active (weekdays)
   Every 15 min:
   └─ Price refresh from brokers
   └─ Update technical indicators
   └─ Refresh signals
   └─ Cache invalidation

15:30 IST    Market close
             └─ Final EOD snapshot
             └─ INSERT portfolio_snapshots
             └─ Archive intraday data

23:59 IST    Midnight maintenance
             └─ Backup database
             └─ Cleanup old cache entries
             └─ Rotate logs

Anytime     User-triggered:
            ├─ Manual sync: POST /api/assets/sync
            ├─ Backtest: POST /api/backtesting/runs
            ├─ Portfolio snapshot: POST /api/portfolio/snapshot
            └─ News refresh: POST /api/news/refresh
```

---

## 🎯 Key Metrics to Monitor

```
Backend Performance
├─ Request latency (p50, p95, p99)
│  └─ Target: < 100ms p95
├─ Request/sec throughput
│  └─ Target: 1000+ req/sec
├─ Error rate
│  └─ Target: < 0.1%
└─ Database connections
   └─ Target: < 80% of pool

Cache Performance
├─ Redis hit rate
│  └─ Target: > 70%
├─ Cache TTL effectiveness
│  └─ Target: > 90% avoid recompute
└─ Redis memory usage
   └─ Target: < 80% capacity

Task Queue Performance
├─ Celery queue depth
│  └─ Target: < 100 pending tasks
├─ Worker utilization
│  └─ Target: 50-80% busy
├─ Task success rate
│  └─ Target: > 99.5%
└─ Task avg duration
   └─ Target: < 5 min per task

Database Performance
├─ Query execution time
│  └─ Target: < 100ms p95
├─ Slow query count
│  └─ Target: < 1/min
├─ Connection utilization
│  └─ Target: 20-30 active
└─ Replication lag
   └─ Target: < 100ms
```

---

## 🚨 Failure Modes & Recovery

```
Failure             Symptom              Recovery
────────────────────────────────────────────────────────────
Database down       500 errors           Restart postgres / failover
Redis down          Slow responses       Restart redis (data preserved)
RabbitMQ down       Tasks not running    Use eager mode (in-process)
Gemini API limit    No AI briefing       Switch to Groq (automatic)
Network timeout     Broker sync fails    Retry in next cycle
Out of memory       OOM killed           Scale up instance / reduce cache
Disk full           No new writes        Archive old data
Lock contention     Slow queries         Query optimization
Connection leak     Pool exhausted       Restart backend
Code bug            Exceptions in logs   Hotfix + redeploy
```

---

## 📈 Scaling Decision Tree

```
System hitting limits?
    │
    ├─ API Response slow?
    │  ├─ DB? → Add index / read replica
    │  ├─ Cache? → Increase Redis / TTL
    │  └─ Code? → Profile / optimize
    │
    ├─ Database slow?
    │  ├─ Connections exhausted? → Increase pool size
    │  ├─ Disk I/O? → SSD / vertical scale
    │  └─ CPU? → Optimize queries / add replica
    │
    ├─ Celery tasks backing up?
    │  ├─ Queue depth > 1000? → Add workers
    │  ├─ Task duration > 5min? → Optimize code
    │  └─ Worker CPU > 80%? → Vertical scale workers
    │
    ├─ Memory exhaustion?
    │  ├─ Cache? → Reduce TTL / evict policy
    │  ├─ Workers? → Reduce prefetch
    │  └─ Database? → Partition / archive
    │
    └─ User concurrency too high?
       ├─ < 100 concurrent? → Single instance
       ├─ 100-1000? → 3-5 instances + load balancer
       └─ > 1000? → Kubernetes / sharding by user_id
```

---

## 💡 Pro Tips (Learned from Running This System)

1. **Always check Redis first** when debugging slow responses
   - `redis-cli INFO stats` → Hit ratio
   - `redis-cli KEYS "*"` → See what's cached

2. **Celery tasks should be idempotent**
   - Can be retried without side effects
   - Use unique IDs for deduplication

3. **Time-series data explodes fast**
   - 45 symbols × 4 prices/hour × 365 days = 1.5M rows
   - Archive/partition after 6 months

4. **JWT expiry creates UX friction**
   - Refresh tokens automatically, don't force logout
   - But keep short access token (60 min) for security

5. **AI API rate limits are real**
   - Always have a fallback model
   - Cache aggressively (24 hour TTL for briefing)

6. **Database transactions matter**
   - Wrap multi-step operations in transaction
   - Rollback on any failure, no partial updates

7. **Timezone bugs are subtle**
   - Always store UTC, display IST
   - Use `pytz.timezone()` not naive datetime

8. **Monitor before it breaks**
   - Set up alerts before production
   - Disk space, memory, CPU, connections

---

**Last Updated**: 2026-04-16

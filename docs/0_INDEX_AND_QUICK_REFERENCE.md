# Investment OS - Documentation Index & Quick Reference

## 📚 Documentation Files Overview

This documentation is organized into **5 comprehensive markdown files** designed for minimal token consumption and maximum clarity:

| File | Size | Focus | Use When |
|------|------|-------|----------|
| **1_PROJECT_OVERVIEW.md** | 6.8 KB | High-level project purpose, features, tech stack | You're new to the project or need a quick overview |
| **2_ARCHITECTURE_DESIGN.md** | 11 KB | System design, module structure, infrastructure layers | You're understanding how components interact |
| **3_DATABASE_SCHEMA.md** | 12.7 KB | All 22 tables, relationships, indexes, data model | You need to add/modify data models or write SQL queries |
| **4_API_REFERENCE_DATAFLOW.md** | 13.3 KB | All 11 API modules, endpoint specs, request/response examples, data flows | You're consuming/building the API or debugging data flow |
| **5_TECH_STACK_INFRASTRUCTURE.md** | 13.2 KB | Dependencies, deployment, environment setup, monitoring | You're deploying, scaling, or troubleshooting infrastructure |
| **THIS FILE** | 5 KB | Cross-file navigation, common tasks, patterns | You're lost or need quick lookup |

**Total Documentation**: ~57 KB (highly optimized for search and reference)

---

## 🎯 Find What You Need (Quick Lookup)

### I'm debugging a specific error

1. **"Database connection failed"**
   - See: `5_TECH_STACK_INFRASTRUCTURE.md` → Environment Variables → DATABASE_URL
   - Check: `docker-compose.yml` → postgres service status

2. **"Redis unavailable" warning**
   - This is expected! See: `2_ARCHITECTURE_DESIGN.md` → Core Infrastructure → Caching
   - Cache degrades to no-op (system still works)

3. **"Celery task not running"**
   - See: `5_TECH_STACK_INFRASTRUCTURE.md` → Task Queue & Scheduling
   - Check: RabbitMQ running, Celery worker active
   - Fallback: Tasks run eagerly (synchronously)

4. **"API returning 400 error"**
   - See: `2_ARCHITECTURE_DESIGN.md` → Error Handling
   - Check response: `{"error": "CODE", "message": "Details"}`

5. **"AI briefing not generating"**
   - See: `4_API_REFERENCE_DATAFLOW.md` → Flow 3: AI Briefing Generation
   - Check: Gemini API key configured, Groq as fallback

### I'm adding a new feature

1. **Adding a new module**
   - See: `1_PROJECT_OVERVIEW.md` → Adding a New Module
   - Template structure in: `2_ARCHITECTURE_DESIGN.md` → Module Architecture

2. **Adding a new API endpoint**
   - See: `4_API_REFERENCE_DATAFLOW.md` → Pattern (all endpoints documented)
   - Follow: Route → Service → Repository pattern

3. **Adding a new database table**
   - See: `3_DATABASE_SCHEMA.md` → Pick similar table, copy structure
   - Auto-created at startup via SQLAlchemy Base

4. **Adding async task/scheduling**
   - See: `5_TECH_STACK_INFRASTRUCTURE.md` → Task Queue
   - Template: `app/tasks/` → Check existing tasks

5. **Adding notification type**
   - See: `3_DATABASE_SCHEMA.md` → notifications table
   - Integrate: Telegram Bot or in-app notification

### I'm understanding data flow

1. **Portfolio → Price Update → Signal**
   - See: `4_API_REFERENCE_DATAFLOW.md` → Flow 1 & 2 (diagrams)

2. **User Login → API Call → Database**
   - See: `2_ARCHITECTURE_DESIGN.md` → Dependency Flow (diagram)

3. **How data gets from Zerodha to Frontend**
   - See: `4_API_REFERENCE_DATAFLOW.md` → Flow 5: News Sentiment (similar pattern)

4. **Where prices are stored & cached**
   - See: `3_DATABASE_SCHEMA.md` → prices table + `2_ARCHITECTURE_DESIGN.md` → Caching

### I'm deploying to production

1. **Environment setup**
   - See: `5_TECH_STACK_INFRASTRUCTURE.md` → Environment Variables
   - Copy `.env.example` → `.env` → Fill in secrets

2. **Docker deployment**
   - See: `5_TECH_STACK_INFRASTRUCTURE.md` → Production Deployment Stack
   - Dockerfile in project root, docker-compose in root

3. **Database migrations**
   - Currently: SQLAlchemy auto-creates tables
   - Future: Use Alembic (see `requirements.txt`)

4. **Scaling workers**
   - See: `5_TECH_STACK_INFRASTRUCTURE.md` → Production Deployment
   - Kubernetes ASG for Celery workers

5. **Monitoring setup**
   - See: `5_TECH_STACK_INFRASTRUCTURE.md` → Monitoring & Observability

### I'm optimizing performance

1. **Database query slow**
   - See: `3_DATABASE_SCHEMA.md` → Indexing Strategy
   - Check if index exists on query columns

2. **API response time high**
   - See: `2_ARCHITECTURE_DESIGN.md` → GET /api/state flow
   - Add caching or denormalization

3. **Cache hit rate low**
   - See: `2_ARCHITECTURE_DESIGN.md` → Caching (TTL defaults)
   - Increase TTL or reduce cache invalidation

4. **Celery queue backlog**
   - See: `5_TECH_STACK_INFRASTRUCTURE.md` → Celery Performance Tuning
   - Scale workers or optimize task duration

---

## 🔄 Common Code Patterns

### Pattern 1: Service Layer (Business Logic)

```python
# File: app/modules/<feature>/services.py

from sqlalchemy.orm import Session
from app.shared.exceptions import NotFoundError, ValidationError

class SomeService:
    def get_by_id(self, session: Session, id: int):
        obj = session.query(Model).filter(Model.id == id).first()
        if not obj:
            raise NotFoundError(f"Object {id} not found")
        return obj
    
    def create(self, session: Session, data: dict):
        # Validate
        if not data.get('required_field'):
            raise ValidationError("required_field is mandatory")
        
        # Create
        obj = Model(**data)
        session.add(obj)
        session.commit()
        session.refresh(obj)
        return obj
```

### Pattern 2: FastAPI Route

```python
# File: app/modules/<feature>/routes.py

from fastapi import APIRouter, Depends
from app.core.dependencies import get_session, get_current_user
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/feature", tags=["feature"])

@router.get("/items")
def get_items(session: Session = Depends(get_session), current_user = Depends(get_current_user)):
    # Route calls service
    return SomeService().list(session)

@router.post("/items")
def create_item(payload: ItemSchema, session: Session = Depends(get_session)):
    return SomeService().create(session, payload.dict())
```

### Pattern 3: Celery Async Task

```python
# File: app/tasks/example.py

from celery import shared_task
from app.core.db import SessionLocal
from sqlalchemy.orm import Session

@shared_task(bind=True, max_retries=3)
def sync_prices_task(self):
    session = SessionLocal()
    try:
        # Fetch from API
        prices = fetch_prices_from_api()
        
        # Batch insert
        session.execute(insert(Price).values(prices))
        session.commit()
        
        return {"status": "success", "count": len(prices)}
    except Exception as exc:
        session.rollback()
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
    finally:
        session.close()
```

### Pattern 4: Response Schema

```python
# File: app/modules/<feature>/schemas.py

from pydantic import BaseModel, Field
from datetime import datetime

class ItemResponse(BaseModel):
    id: int
    name: str = Field(..., description="Item name")
    created_at: datetime
    
    class Config:
        from_attributes = True  # ORM mode for SQLAlchemy
```

### Pattern 5: Caching Pattern

```python
from app.core.dependencies import get_cache

def get_data(cache, key: str):
    # Try cache first
    cached = cache.get(key)
    if cached:
        return cached
    
    # Miss: compute
    data = expensive_computation()
    
    # Store in cache (1 hour TTL)
    cache.set(key, data, ttl_seconds=3600)
    
    return data
```

---

## 📊 Data Model Cheat Sheet

### Users & Auth
```
users (root)
  ↓
  tokens (JWT storage)
```

### Portfolio
```
assets (aggregated by symbol)
  ├─ positions (per-source detail)
  ├─ transactions (history)
  ├─ prices (time-series)
  ├─ technical_indicators (RSI, BB, etc)
  ├─ fundamentals (PE, EPS, etc)
  └─ signals (BUY/SELL)

portfolio_snapshots (historical)
  └─ snapshot_assets (denormalized)
```

### Intelligence
```
news (articles + sentiment)
analytics_results (analysis output)
ai_briefing (daily summary)
```

### Configuration
```
provider_configs (API keys)
job_configs (schedules)
job_logs (execution history)
```

### Features
```
backtesting_runs
notifications
user_profile
tax_lots
```

---

## 🚀 Getting Started Commands

### Local Development

```bash
# Setup
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Infra
docker-compose up -d postgres redis

# Backend
cp .env.example .env
uvicorn app.main:app --reload  # http://localhost:8001/docs

# Frontend (separate terminal)
cd frontend
npm install
npm run dev  # http://localhost:5173

# Celery (optional, third terminal)
celery -A app.core.celery_app worker --loglevel=info
celery -A app.core.celery_app beat --loglevel=info

# Tests
pytest tests/
pytest tests/core/test_config.py -v
```

### API Exploration

```bash
# Swagger UI
http://localhost:8001/docs

# ReDoc
http://localhost:8001/redoc

# Test endpoint
curl -X GET http://localhost:8001/api/state

# With auth
curl -H "Authorization: Bearer <token>" http://localhost:8001/api/portfolio/summary
```

### Database

```bash
# Connect
psql -U admin -d investment_os -h localhost

# Check tables
\dt

# Sample queries
SELECT * FROM assets LIMIT 10;
SELECT * FROM signals ORDER BY ts DESC LIMIT 5;
SELECT COUNT(*) FROM prices;
```

---

## 🔐 Security Checklist

- [ ] `.env` file created (never commit)
- [ ] `SECRET_KEY` is 32+ random characters
- [ ] Database password != "admin" in production
- [ ] API keys stored as environment variables
- [ ] CORS_ORIGINS restricted to frontend domain
- [ ] JWT tokens use `HS256` (or higher)
- [ ] HTTPS enforced (SSL/TLS)
- [ ] API rate limiting configured
- [ ] Credentials encrypted in database
- [ ] Sensitive logs redacted

---

## 📈 Scalability Notes

**Current Limits**:
- Single backend instance: ~1000 req/min
- PostgreSQL: ~10M rows before optimization needed
- Redis: In-memory, size limited by available RAM

**Scaling Strategies**:
1. **Horizontal Backend**: Add more instances behind load balancer
2. **Celery Workers**: Spawn workers per task type
3. **Database Replication**: Read replicas for analytics
4. **Caching**: Redis cluster, increased TTL
5. **CDN**: Frontend static assets

See `5_TECH_STACK_INFRASTRUCTURE.md` for production setup.

---

## 🐛 Troubleshooting Flowchart

```
Something broken?
  │
  ├─ "Module not found" → Check imports in app/main.py::register_models()
  ├─ "Table doesn't exist" → Restart backend (auto-creates via SQLAlchemy)
  ├─ "API 500 error" → Check logs in api.log
  ├─ "Cache not working" → Redis down (check docker-compose up)
  ├─ "Celery tasks not running" → Start worker: celery -A app.core.celery_app worker
  ├─ "Token expired" → Generate new token via /auth/login
  ├─ "CORS error in frontend" → Check CORS_ORIGINS in .env
  ├─ "AI not responding" → Check GEMINI_API_KEY, Groq fallback
  └─ "Database not connecting" → Verify DATABASE_URL, postgres running
```

---

## 📝 Maintenance Tasks

| Task | Frequency | Command |
|------|-----------|---------|
| Backup database | Daily | `docker exec postgres pg_dump ...` |
| Check API health | Every 5 min | `curl http://localhost:8001/docs` |
| Monitor logs | Continuous | `tail -f api.log` |
| Clean old prices | Weekly | SQL DELETE where ts < 90 days ago |
| Update dependencies | Monthly | `pip install --upgrade -r requirements.txt` |
| Run tests | Before deploy | `pytest` |
| Archive job logs | Monthly | SQL archive job_logs table |

---

## 🎓 Learning Path

### Level 1: Basics (Read in order)
1. `1_PROJECT_OVERVIEW.md` - Understand what the system does
2. `3_DATABASE_SCHEMA.md` - Learn data model
3. `4_API_REFERENCE_DATAFLOW.md` - See how data flows

### Level 2: Development (For code changes)
1. `2_ARCHITECTURE_DESIGN.md` - Understand structure
2. Check relevant module: `app/modules/<feature>/`
3. Follow patterns in section above

### Level 3: Operations (For deployment/scaling)
1. `5_TECH_STACK_INFRASTRUCTURE.md` - Infrastructure & deployment
2. `2_ARCHITECTURE_DESIGN.md` - Core infrastructure layers

### Level 4: Deep Dive (Advanced)
- Read all files end-to-end
- Study actual code in `app/`
- Run tests: `pytest -v`

---

## 📞 Support & Resources

- **API Docs**: http://localhost:8001/docs (Swagger UI)
- **Logs**: `api.log` file in project root
- **Database**: Connect with `psql` using credentials in `.env`
- **External APIs**: Check respective documentation
- **Error Codes**: See `app/shared/exceptions.py`

---

**Documentation Version**: 1.0
**Last Updated**: 2026-04-16
**Timezone**: Asia/Kolkata (IST)
**License**: Private

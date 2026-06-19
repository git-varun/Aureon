# Aureon Backend API Service

FastAPI-based backend for the Aureon portfolio management system, integrating with PostgreSQL primary database storage, Redis cache backend, and Celery worker pipelines.

## Project Structure

- `app/`: Monolith application codebase.
  - `api/`: Route endpoints controllers and fallback compatibility handlers.
  - `core/`: Settings config, exception schemas, database hooks, and logger.
  - `domain/`: Business entities and database services.
  - `infrastructure/`: Database repositories and external quote providers.
  - `workers/`: Celery task definitions and orchestration pipelines.
- `alembic/`: Database schema version tracking.
- `tests/`: Automated pytest unit and integration coverage.

## Local Onboarding & Installation

1. Create a Python virtual environment (Python >= 3.11):
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -e .[dev]
   ```
3. Copy environment settings template and configure:
   ```bash
   cp .env.example .env
   ```
4. Run migrations:
   ```bash
   alembic upgrade head
   ```
5. Run the local development API:
   ```bash
   uvicorn app.api.main:app --host 0.0.0.0 --port 8001 --reload
   ```

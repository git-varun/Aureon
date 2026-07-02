# Aureon Project Development Makefile

.PHONY: help install dev backend frontend worker beat migrate upgrade bootstrap test test-docker reset-db lint typecheck format clean

help:
	@echo "Available commands:"
	@echo "  make install     - Install backend (uv) and frontend (npm) dependencies"
	@echo "  make dev         - Start both backend API and React frontend dev servers"
	@echo "  make backend     - Start the FastAPI backend API server locally"
	@echo "  make frontend    - Start the React frontend development server"
	@echo "  make worker      - Start Celery worker queue"
	@echo "  make beat        - Start Celery beat scheduler"
	@echo "  make migrate     - Generate a new Alembic migration from model changes"
	@echo "  make upgrade     - Apply pending Alembic migrations to DATABASE_URL"
	@echo "  make bootstrap   - Run the idempotent bootstrap script (migrations, seed data, health check)"
	@echo "  make test        - Run the backend test suite against TEST_DATABASE_URL (never DATABASE_URL)"
	@echo "  make test-docker - Run the backend test suite in a fully isolated Docker stack"
	@echo "  make reset-db    - Drop, recreate, and re-migrate the test database"
	@echo "  make lint        - Run static analysis syntax and linting scans"
	@echo "  make typecheck   - Verify type safety of the backend using mypy"
	@echo "  make format      - Automatically format backend source code using ruff"
	@echo "  make clean       - Purge caches, bytecode, and test infrastructure state"

install:
	@echo "Setting up backend Python environment (uv)..."
	cd backend && uv sync --extra dev
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

dev:
	@echo "Starting backend and frontend development servers concurrently..."
	npx concurrently --kill-others \
		"make backend" \
		"make frontend"

backend:
	cd backend && uv run uvicorn app.api.main:app --host 0.0.0.0 --port 8001 --reload

frontend:
	cd frontend && npm run dev

worker:
	cd backend && uv run celery -A app.workers.celery_app worker --loglevel=info --concurrency=4 -Q q_ingestion

beat:
	cd backend && uv run celery -A app.workers.celery_app beat --loglevel=info --schedule=data/celerybeat-schedule

migrate:
	cd backend && uv run alembic revision --autogenerate

upgrade:
	cd backend && uv run alembic upgrade head

bootstrap:
	./bootstrap.sh

# TEST_DATABASE_URL must be set (in backend/.env or the environment) — tests refuse to run
# against DATABASE_URL. See app/core/config.py:select_test_database.
test:
	cd backend && uv run pytest tests/ -q

test-docker:
	docker compose -f docker-compose.test.yml up --build --abort-on-container-exit backend
	docker compose -f docker-compose.test.yml down -v

reset-db:
	@echo "Dropping and recreating the test database..."
	cd backend && TESTING=true uv run python scripts/reset_test_db.py
	cd backend && TESTING=true uv run alembic upgrade head

lint:
	cd backend && uv run ruff check .

typecheck:
	cd backend && uv run mypy .

format:
	cd backend && uv run ruff format .

clean:
	@echo "Cleaning caches and bytecode residues..."
	find . -type d -name "__pycache__" -exec rm -rf {} +
	rm -rf backend/.mypy_cache backend/.pytest_cache backend/.ruff_cache
	rm -rf frontend/node_modules frontend/dist
	docker compose -f docker-compose.test.yml down -v 2>/dev/null || true

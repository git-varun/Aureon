# Aureon Project Development Makefile

.PHONY: help install dev backend frontend worker beat migrate upgrade seed test lint typecheck format clean

help:
	@echo "Available commands:"
	@echo "  make install    - Setup backend virtualenv and install frontend dependencies"
	@echo "  make dev        - Start both backend API and React frontend dev servers"
	@echo "  make backend    - Start the FastAPI backend API server locally"
	@echo "  make frontend   - Start the React frontend development server"
	@echo "  make worker     - Start Celery worker queue"
	@echo "  make beat       - Start Celery beat scheduler"
	@echo "  make migrate    - Generate a new Alembic migration schema check"
	@echo "  make upgrade    - Upgrade relational database schemas to head version"
	@echo "  make seed       - Seed default assets and user accounts into local SQLite DB"
	@echo "  make test       - Run backend automated pytest regression suite"
	@echo "  make lint       - Run static analysis syntax and linting scans"
	@echo "  make typecheck  - Verify type safety of the backend using mypy"
	@echo "  make format     - Automatically format backend source code using ruff"
	@echo "  make clean      - Purge test databases, python bytecode cache files, and tool caches"

install:
	@echo "Setting up backend Python environment..."
	cd backend && python3 -m venv .venv && .venv/bin/pip install -e .[dev]
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

dev:
	@echo "Starting backend and frontend development servers concurrently..."
	npx concurrently --kill-others \
		"make backend" \
		"make frontend"

backend:
	cd backend && .venv/bin/uvicorn app.api.main:app --host 0.0.0.0 --port 8001 --reload

frontend:
	cd frontend && npm run dev

worker:
	cd backend && .venv/bin/celery -A app.workers.celery_app worker --loglevel=info --concurrency=4 -Q q_ingestion

beat:
	cd backend && .venv/bin/celery -A app.workers.celery_app beat --loglevel=info --schedule=data/celerybeat-schedule

migrate:
	cd backend && .venv/bin/alembic revision --autogenerate

upgrade:
	cd backend && .venv/bin/alembic upgrade head

seed:
	cd backend && .venv/bin/python scripts/seed_assets.py
	cd backend && .venv/bin/python scripts/seed_test_user.py

test:
	cd backend && .venv/bin/pytest

lint:
	cd backend && .venv/bin/ruff check .

typecheck:
	cd backend && .venv/bin/mypy .

format:
	cd backend && .venv/bin/ruff format .

clean:
	@echo "Cleaning caches and bytecode residues..."
	find . -type d -name "__pycache__" -exec rm -rf {} +
	rm -rf backend/.mypy_cache backend/.pytest_cache backend/.ruff_cache
	rm -rf frontend/node_modules frontend/dist
	rm -f backend/test.db

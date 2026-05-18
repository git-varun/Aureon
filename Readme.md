Here's the full local setup without Docker.

  ---
Prerequisites (install once)

# PostgreSQL

sudo apt install postgresql postgresql-contrib

# Redis

sudo apt install redis-server

# RabbitMQ

sudo apt install rabbitmq-server

# Node (if not already)

sudo apt install nodejs npm

# Python deps (from project root)

pip install -r backend/requirements.txt

  ---

1. Start infrastructure services

# PostgreSQL — starts automatically after install, or:

sudo systemctl start postgresql

# Create the database (first time only)

sudo -u postgres psql -c "CREATE DATABASE aureon;"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"

# Redis

sudo systemctl start redis-server

# RabbitMQ

sudo systemctl start rabbitmq-server

  ---

2. Configure .env

Edit /home/dev-var/Personal/Projects/aureon/.env and set these three lines (they're blank right now):

REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=amqp://guest:guest@localhost:5672//
CELERY_RESULT_BACKEND=redis://localhost:6379/1

The rest (DB, API keys) are already filled in.

  ---

3. Run the backend (FastAPI)

From the project root (/home/dev-var/Personal/Projects/aureon):

PYTHONPATH=backend uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

  ---

4. Run Celery worker (new terminal)

PYTHONPATH=backend celery -A app.core.celery_app worker \
--loglevel=info --concurrency=4 \
-Q celery,price-queue,ai-queue,pipeline-queue

  ---

5. Run Celery beat scheduler (new terminal)

PYTHONPATH=backend celery -A app.core.celery_app beat --loglevel=info

  ---

6. Run the frontend (new terminal)

cd frontend
npm install # first time only
npm run dev

Frontend at http://localhost:5173, API at http://localhost:8001.

  ---
Quick health checks

# Postgres

psql postgresql://postgres:postgres@localhost:5432/aureon -c "SELECT 1;"

# Redis

redis-cli ping # should return PONG

# RabbitMQ

sudo rabbitmqctl status | grep running

# API

curl http://localhost:8001/api/health
  
---
Skip Celery entirely (no RabbitMQ/Redis needed)

Leave CELERY_BROKER_URL and CELERY_RESULT_BACKEND blank in .env. Celery will run in eager mode — tasks execute
synchronously inline when triggered. Useful for pure frontend/API dev without needing 3 extra services running.
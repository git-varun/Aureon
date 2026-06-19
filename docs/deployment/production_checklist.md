# Production Readiness Checklist

This checklist contains the necessary checkpoints and hardening measures before deploying the Aureon monolithic platform to a production environment.

## 1. Security & Cryptography
* [ ] **`SECRET_KEY`**: Set a cryptographically secure key of at least 32 characters in the environment. Do not use the default developer secret.
* [ ] **`DEBUG`**: Disable debug mode (`DEBUG=False` in environment) to turn off verbose traceback logging.
* [ ] **CORS Origins**: Restrict `CORS_ALLOWED_ORIGINS` to the exact production domain URL. Do not use wildcard `*` values.
* [ ] **HTTPS / SSL**: Terminate SSL at a reverse proxy (e.g. Nginx or Cloudflare) to ensure all API request payloads and JWT headers are encrypted.
* [ ] **Token Lifespan**: Set `ACCESS_TOKEN_EXPIRE_MINUTES` to a short lifespan (e.g. 15-30 minutes) to mitigate token theft risks.

## 2. Relational Database (PostgreSQL)
* [ ] **Engine Connection**: Ensure `DATABASE_URL` is set to the primary production Postgres cluster using the `postgresql+psycopg` dialect.
* [ ] **Connection Pool**: Verify pool sizes are configured for production scale:
  - `pool_size=10`
  - `max_overflow=5`
* [ ] **Migrations**: Always run `alembic upgrade head` in a locked, single-instance runner before spawning API workers.
* [ ] **Database Backups**: Schedule automated daily database dumps (`pg_dump`) to remote storage.

## 3. Caching & Message Broker
* [ ] **Redis Broker & Cache**: Run Redis with persistent append-only logs (`appendonly yes` and `appendfsync everysec`). Set up the same Redis node or dedicated instances for Celery broker, result backend, and caching operations.
* [ ] **Task Queues Routing**: Verify Celery task queues are partitioned:
  - `price-queue` for market downloads.
  - `ai-queue` for Gemini prompts.
  - `pipeline-queue` for daily execution.

## 4. Monitoring & Diagnostics
* [ ] **Logging Limits**: Set log level to `INFO` to prevent logging sensitive user tokens or API secrets.
* [ ] **Health Endpoint**: Configure external infrastructure checkers (Nginx, load balancer) to hit the `/api/v1/health` and `/health/ready` check paths.
* [ ] **SLA Compliance**: Monitor the `monitoring_sla_health` metric logs to track technical quote aging limits.

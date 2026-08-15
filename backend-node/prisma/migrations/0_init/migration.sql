-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ai";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "config";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "evaluation";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "market";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "news";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "notification";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "portfolio";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "recommendation";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "system";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "watchlist";

-- CreateEnum
CREATE TYPE "jobstatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "taskrunstatus" AS ENUM ('STARTED', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "ai"."ai_briefings" (
    "briefing_type" VARCHAR(30) NOT NULL,
    "symbol" VARCHAR(30),
    "content" JSONB NOT NULL,
    "model_used" VARCHAR(100) NOT NULL,
    "prompt_tokens" INTEGER,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_ai_briefings" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."ai_evaluations" (
    "generation_id" UUID NOT NULL,
    "faithfulness_score" DECIMAL,
    "relevance_score" DECIMAL,
    "data_reference_validated" BOOLEAN NOT NULL,
    "validation_details" JSONB,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_ai_evaluations" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."ai_feedback" (
    "generation_id" UUID NOT NULL,
    "user_id" UUID,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_ai_feedback" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."ai_generations" (
    "user_id" UUID,
    "feature_name" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "model" VARCHAR(128) NOT NULL,
    "prompt_version" VARCHAR(32),
    "prompt_text" TEXT NOT NULL,
    "context_payload" JSONB,
    "retrieval_metadata" JSONB,
    "response_text" TEXT NOT NULL,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "total_tokens" INTEGER,
    "latency_ms" INTEGER,
    "execution_trace" JSONB,
    "error_message" TEXT,
    "generation_parameters" JSONB NOT NULL,
    "prompt_sha256" VARCHAR(64),
    "data_classification" VARCHAR(32),
    "payload_retention_state" VARCHAR(32) NOT NULL,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_ai_generations" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config"."allocation_targets" (
    "id" SERIAL NOT NULL,
    "asset_class" VARCHAR(40) NOT NULL,
    "target_pct" INTEGER NOT NULL,
    "band_low_pct" INTEGER,
    "band_high_pct" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "pk_allocation_targets" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config"."job_configs" (
    "id" SERIAL NOT NULL,
    "job_name" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "last_run_at" TIMESTAMPTZ(6),
    "job_tier" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "pk_job_configs" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config"."job_logs" (
    "id" SERIAL NOT NULL,
    "job_name" VARCHAR(64) NOT NULL,
    "status" "jobstatus" NOT NULL,
    "task_id" VARCHAR(512),
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "result_summary" JSONB,

    CONSTRAINT "pk_job_logs" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config"."provider_configs" (
    "id" SERIAL NOT NULL,
    "provider_name" VARCHAR(64) NOT NULL,
    "provider_type" VARCHAR(32) NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "key_names" TEXT NOT NULL,
    "encrypted_keys" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "capabilities" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "health" TEXT NOT NULL,
    "rate_limit" VARCHAR(64),
    "timeout_seconds" INTEGER NOT NULL,
    "retry_policy" TEXT NOT NULL,
    "cache_ttl_seconds" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "pk_provider_configs" PRIMARY KEY ("id")
);

-- Prisma does not model CHECK constraints (see the `prisma db pull` warning:
-- "These constraints are not supported by Prisma Client"), so this one is
-- added by hand to make 0_init a faithful reproduction of the live schema.
ALTER TABLE "config"."provider_configs" ADD CONSTRAINT "ck_provider_configs_status_valid" CHECK ((status)::text = ANY ((ARRAY['PLANNED'::character varying, 'STUB'::character varying, 'PARTIAL'::character varying, 'ACTIVE'::character varying, 'DISABLED'::character varying, 'DEPRECATED'::character varying, 'FAILED'::character varying])::text[]));

-- CreateTable
CREATE TABLE "evaluation"."asset_scores" (
    "asset_id" UUID NOT NULL,
    "model_version" VARCHAR NOT NULL,
    "recommendation_score" DECIMAL,
    "quality_score" DECIMAL,
    "valuation_score" DECIMAL,
    "generated_at" TIMESTAMP(6) NOT NULL,
    "unavailable_inputs" JSONB NOT NULL,

    CONSTRAINT "pk_asset_scores" PRIMARY KEY ("asset_id","model_version")
);

-- CreateTable
CREATE TABLE "evaluation"."feature_snapshots" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "snapshot_at" TIMESTAMP(6) NOT NULL,
    "model_version" VARCHAR NOT NULL,
    "feature_schema_version" VARCHAR NOT NULL,
    "features" JSONB NOT NULL,

    CONSTRAINT "pk_feature_snapshots" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market"."asset_features" (
    "asset_id" UUID NOT NULL,
    "price" DECIMAL,
    "market_cap" DECIMAL,
    "momentum_score" DECIMAL,
    "volatility_score" DECIMAL,
    "sentiment_score" DECIMAL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_asset_features" PRIMARY KEY ("asset_id")
);

-- CreateTable
CREATE TABLE "market"."asset_fundamentals" (
    "asset_id" UUID NOT NULL,
    "trailing_pe" DECIMAL,
    "price_to_book" DECIMAL,
    "roe" DECIMAL,
    "debt_to_equity" DECIMAL,
    "profit_margin" DECIMAL,
    "revenue_growth" DECIMAL,
    "dividend_yield" DECIMAL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_asset_fundamentals" PRIMARY KEY ("asset_id")
);

-- CreateTable
CREATE TABLE "market"."asset_health" (
    "asset_id" UUID NOT NULL,
    "provider_name" VARCHAR NOT NULL,
    "last_successful_ingestion" TIMESTAMP(6),
    "quote_age_seconds" INTEGER,
    "fundamentals_age_seconds" INTEGER,
    "signal_age_seconds" INTEGER,
    "news_age_seconds" INTEGER,
    "status" VARCHAR NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_asset_health" PRIMARY KEY ("asset_id","provider_name")
);

-- CreateTable
CREATE TABLE "market"."asset_snapshot" (
    "asset_id" UUID NOT NULL,
    "price" DECIMAL,
    "market_cap" DECIMAL,
    "pe_ratio" DECIMAL,
    "rsi" DECIMAL,
    "momentum_score" DECIMAL,
    "volatility_score" DECIMAL,
    "sentiment_score" DECIMAL,
    "payload" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_asset_snapshot" PRIMARY KEY ("asset_id")
);

-- CreateTable
CREATE TABLE "market"."assets" (
    "id" UUID NOT NULL,
    "symbol" VARCHAR NOT NULL,
    "name" VARCHAR NOT NULL,
    "asset_class" VARCHAR NOT NULL,
    "metadata" JSONB,
    "classification" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "tier" INTEGER,
    "last_news_fetch_at" TIMESTAMP(6),
    "is_tracked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pk_assets" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market"."latest_quotes" (
    "symbol" VARCHAR NOT NULL,
    "asset_id" UUID,
    "price" DECIMAL NOT NULL,
    "volume" DECIMAL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "provider" VARCHAR,

    CONSTRAINT "pk_latest_quotes" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "market"."market_themes" (
    "id" UUID NOT NULL,
    "theme_id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "desc" VARCHAR NOT NULL,
    "symbols" JSONB NOT NULL,
    "ret1m" DECIMAL NOT NULL,
    "owner_id" UUID,
    "forked_from" VARCHAR(40),
    "inception_date" VARCHAR(20),
    "is_public" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_market_themes" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market"."price_history" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "symbol" VARCHAR NOT NULL,
    "price" DECIMAL NOT NULL,
    "volume" DECIMAL,
    "timestamp" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_price_history" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market"."theme_weights" (
    "id" UUID NOT NULL,
    "theme_id" VARCHAR(40) NOT NULL,
    "symbol" VARCHAR(40) NOT NULL,
    "weight" DECIMAL NOT NULL,
    "effective_date" VARCHAR(20) NOT NULL,
    "mcap_at_set" DECIMAL,
    "created_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_theme_weights" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news"."asset_sentiment_snapshots" (
    "id" SERIAL NOT NULL,
    "asset_id" UUID NOT NULL,
    "snapshot_date" TIMESTAMP(6) NOT NULL,
    "avg_sentiment_7d" DOUBLE PRECISION,
    "avg_sentiment_30d" DOUBLE PRECISION,
    "article_count_7d" INTEGER,
    "trend" VARCHAR(20),
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_asset_sentiment_snapshots" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news"."news" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR NOT NULL,
    "content" TEXT,
    "summary" TEXT,
    "source" VARCHAR NOT NULL,
    "url" VARCHAR,
    "published_at" TIMESTAMPTZ(6),
    "sentiment_score" DOUBLE PRECISION,
    "relevance_score" DOUBLE PRECISION,
    "symbols" VARCHAR,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_news" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news"."news_assets" (
    "news_id" INTEGER NOT NULL,
    "asset_id" UUID NOT NULL,

    CONSTRAINT "pk_news_assets" PRIMARY KEY ("news_id","asset_id")
);

-- CreateTable
CREATE TABLE "notification"."web_notifications" (
    "user_id" UUID,
    "title" VARCHAR NOT NULL,
    "message" TEXT NOT NULL,
    "type" VARCHAR NOT NULL,
    "read" BOOLEAN NOT NULL,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_web_notifications" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."binance_backfill_progress" (
    "portfolio_id" UUID NOT NULL,
    "symbol" VARCHAR NOT NULL,
    "last_from_id" BIGINT,
    "trades_fetched" INTEGER NOT NULL,
    "trades_imported" INTEGER NOT NULL,
    "done" BOOLEAN NOT NULL,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_binance_backfill_progress" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."import_runs" (
    "portfolio_id" UUID NOT NULL,
    "source" VARCHAR NOT NULL,
    "filename" VARCHAR NOT NULL,
    "status" VARCHAR NOT NULL,
    "rows_committed" INTEGER NOT NULL,
    "rows_skipped" INTEGER NOT NULL,
    "error_summary" TEXT,
    "started_at" TIMESTAMP(6) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_import_runs" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."portfolios" (
    "name" VARCHAR NOT NULL,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pk_portfolios" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."positions" (
    "portfolio_id" UUID NOT NULL,
    "symbol" VARCHAR NOT NULL,
    "asset_id" UUID,
    "quantity" DECIMAL NOT NULL,
    "avg_buy_price" DECIMAL NOT NULL,
    "wallet" VARCHAR NOT NULL,
    "leverage" DECIMAL,
    "liquidation_price" DECIMAL,
    "unrealized_pnl" DECIMAL,
    "side" VARCHAR,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "margin_usd" DECIMAL,

    CONSTRAINT "pk_positions" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."snapshots" (
    "portfolio_id" UUID NOT NULL,
    "market_value" DECIMAL,
    "cash_balance" DECIMAL,
    "daily_return" DECIMAL,
    "total_return" DECIMAL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_snapshots" PRIMARY KEY ("portfolio_id")
);

-- CreateTable
CREATE TABLE "portfolio"."transactions" (
    "portfolio_id" UUID NOT NULL,
    "symbol" VARCHAR NOT NULL,
    "asset_id" UUID,
    "transaction_type" VARCHAR NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "price" DECIMAL NOT NULL,
    "transaction_date" TIMESTAMP(6) NOT NULL,
    "fees" DECIMAL NOT NULL,
    "taxes" DECIMAL NOT NULL,
    "notes" VARCHAR,
    "broker" VARCHAR,
    "broker_reference" VARCHAR,
    "kind" VARCHAR NOT NULL,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "recommendation_id" UUID,
    "wallet" VARCHAR NOT NULL DEFAULT 'spot',
    "import_run_id" UUID,

    CONSTRAINT "pk_transactions" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alembic_version" (
    "version_num" VARCHAR(32) NOT NULL,

    CONSTRAINT "alembic_version_pkc" PRIMARY KEY ("version_num")
);

-- CreateTable
CREATE TABLE "recommendation"."recommendation_explanations" (
    "recommendation_id" UUID NOT NULL,
    "rules_matched" JSONB NOT NULL,
    "reasoning" VARCHAR NOT NULL,
    "confidence_factors" JSONB NOT NULL,

    CONSTRAINT "pk_recommendation_explanations" PRIMARY KEY ("recommendation_id")
);

-- CreateTable
CREATE TABLE "recommendation"."recommendation_outcomes" (
    "recommendation_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "action_taken_at" TIMESTAMP(6) NOT NULL,
    "dismiss_reason" VARCHAR,
    "ledger_transaction_id" UUID,
    "predicted_impact" DECIMAL,
    "realized_impact" DECIMAL,

    CONSTRAINT "pk_recommendation_outcomes" PRIMARY KEY ("recommendation_id")
);

-- CreateTable
CREATE TABLE "recommendation"."recommendations" (
    "asset_id" UUID NOT NULL,
    "recommendation_state" VARCHAR(20) NOT NULL,
    "confidence_score" DECIMAL NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_recommendations" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR NOT NULL,
    "entity_type" VARCHAR NOT NULL,
    "entity_id" VARCHAR,
    "details" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_audit_logs" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."failed_ingestions" (
    "provider" VARCHAR NOT NULL,
    "payload" JSONB NOT NULL,
    "error" VARCHAR NOT NULL,
    "attempts" INTEGER NOT NULL,
    "is_exhausted" BOOLEAN NOT NULL,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_failed_ingestions" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."provider_usage" (
    "provider_id" UUID NOT NULL,
    "endpoint" VARCHAR NOT NULL,
    "request_count" INTEGER NOT NULL,
    "cost_estimate" DECIMAL NOT NULL,
    "recorded_at" TIMESTAMP(6),
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_provider_usage" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."providers" (
    "name" VARCHAR NOT NULL,
    "priority" INTEGER,
    "is_enabled" BOOLEAN NOT NULL,
    "health_status" VARCHAR,
    "last_success_at" TIMESTAMP(6),
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_providers" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."task_runs" (
    "task_name" VARCHAR NOT NULL,
    "task_id" VARCHAR NOT NULL,
    "asset_id" VARCHAR,
    "status" "taskrunstatus" NOT NULL,
    "error_message" VARCHAR,
    "duration_ms" INTEGER,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "id" UUID NOT NULL,

    CONSTRAINT "pk_task_runs" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."user_preferences" (
    "user_id" UUID NOT NULL,
    "risk_profile" VARCHAR,
    "target_profit_pct" DECIMAL,
    "monthly_saving" DECIMAL,
    "working_area" VARCHAR,
    "swing_trading_enabled" BOOLEAN NOT NULL,
    "bio" VARCHAR,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_user_preferences" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."users" (
    "email" VARCHAR NOT NULL,
    "first_name" VARCHAR,
    "last_name" VARCHAR,
    "phone" VARCHAR,
    "is_active" BOOLEAN NOT NULL,
    "profile_picture" VARCHAR,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_users" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist"."watchlist_symbols" (
    "watchlist_id" UUID NOT NULL,
    "symbol" VARCHAR(60) NOT NULL,
    "alert_price" DECIMAL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "id" UUID NOT NULL,
    "alert_direction" VARCHAR(3),
    "alert_triggered" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pk_watchlist_symbols" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist"."watchlists" (
    "user_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_watchlists" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_ai_briefings_type" ON "ai"."ai_briefings"("briefing_type");

-- CreateIndex
CREATE INDEX "idx_ai_generations_user_feature" ON "ai"."ai_generations"("user_id", "feature_name");

-- CreateIndex
CREATE UNIQUE INDEX "ix_config_allocation_targets_asset_class" ON "config"."allocation_targets"("asset_class");

-- CreateIndex
CREATE INDEX "ix_config_allocation_targets_id" ON "config"."allocation_targets"("id");

-- CreateIndex
CREATE UNIQUE INDEX "ix_config_job_configs_job_name" ON "config"."job_configs"("job_name");

-- CreateIndex
CREATE INDEX "ix_config_job_configs_id" ON "config"."job_configs"("id");

-- CreateIndex
CREATE INDEX "ix_config_job_logs_id" ON "config"."job_logs"("id");

-- CreateIndex
CREATE INDEX "ix_config_job_logs_job_name" ON "config"."job_logs"("job_name");

-- CreateIndex
CREATE UNIQUE INDEX "ix_config_provider_configs_provider_name" ON "config"."provider_configs"("provider_name");

-- CreateIndex
CREATE INDEX "ix_config_provider_configs_id" ON "config"."provider_configs"("id");

-- CreateIndex
CREATE INDEX "idx_asset_scores_asset_generated_at" ON "evaluation"."asset_scores"("asset_id", "generated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_feature_snapshots_asset_snapshot_at" ON "evaluation"."feature_snapshots"("asset_id", "snapshot_at" DESC);

-- CreateIndex
CREATE INDEX "idx_asset_health_status" ON "market"."asset_health"("status");

-- CreateIndex
CREATE INDEX "idx_asset_health_updated_at" ON "market"."asset_health"("updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "idx_assets_symbol" ON "market"."assets"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "ix_market_latest_quotes_asset_id" ON "market"."latest_quotes"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "ix_market_market_themes_theme_id" ON "market"."market_themes"("theme_id");

-- CreateIndex
CREATE INDEX "ix_market_market_themes_owner_id" ON "market"."market_themes"("owner_id");

-- CreateIndex
CREATE INDEX "idx_price_history_asset_time" ON "market"."price_history"("asset_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_theme_weight_theme_date" ON "market"."theme_weights"("theme_id", "effective_date");

-- CreateIndex
CREATE INDEX "ix_market_theme_weights_theme_id" ON "market"."theme_weights"("theme_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sentiment_asset_date" ON "news"."asset_sentiment_snapshots"("asset_id", "snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "uq_news_url" ON "news"."news"("url");

-- CreateIndex
CREATE INDEX "ix_news_news_id" ON "news"."news"("id");

-- CreateIndex
CREATE INDEX "idx_news_assets_asset" ON "news"."news_assets"("asset_id");

-- CreateIndex
CREATE INDEX "ix_notification_web_notifications_user_id" ON "notification"."web_notifications"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_binance_backfill_progress_portfolio_symbol" ON "portfolio"."binance_backfill_progress"("portfolio_id", "symbol");

-- CreateIndex
CREATE INDEX "ix_portfolio_import_runs_portfolio_id" ON "portfolio"."import_runs"("portfolio_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_positions_portfolio_symbol" ON "portfolio"."positions"("portfolio_id", "symbol", "wallet");

-- CreateIndex
CREATE INDEX "ix_portfolio_transactions_import_run_id" ON "portfolio"."transactions"("import_run_id");

-- CreateIndex
CREATE INDEX "ix_portfolio_transactions_symbol" ON "portfolio"."transactions"("symbol");

-- CreateIndex
CREATE INDEX "ix_portfolio_transactions_transaction_date" ON "portfolio"."transactions"("transaction_date");

-- CreateIndex
CREATE INDEX "idx_recommendations_asset" ON "recommendation"."recommendations"("asset_id");

-- CreateIndex
CREATE INDEX "idx_recommendations_status" ON "recommendation"."recommendations"("status");

-- CreateIndex
CREATE INDEX "idx_audit_logs_action_time" ON "system"."audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_failed_ingestions_created_at_desc" ON "system"."failed_ingestions"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_failed_ingestions_is_exhausted" ON "system"."failed_ingestions"("is_exhausted");

-- CreateIndex
CREATE INDEX "idx_provider_usage_provider_recorded_at" ON "system"."provider_usage"("provider_id", "recorded_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_providers_name" ON "system"."providers"("name");

-- CreateIndex
CREATE INDEX "idx_task_runs_started_at_desc" ON "system"."task_runs"("started_at" DESC);

-- CreateIndex
CREATE INDEX "idx_task_runs_task_name_asset_id" ON "system"."task_runs"("task_name", "asset_id");

-- CreateIndex
CREATE INDEX "ix_system_task_runs_task_id" ON "system"."task_runs"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "ix_system_user_preferences_user_id" ON "system"."user_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ix_system_users_email" ON "system"."users"("email");

-- CreateIndex
CREATE INDEX "ix_system_users_phone" ON "system"."users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "uq_watchlist_symbol" ON "watchlist"."watchlist_symbols"("watchlist_id", "symbol");

-- CreateIndex
CREATE INDEX "ix_watchlist_watchlists_user_id" ON "watchlist"."watchlists"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_watchlist_user_name" ON "watchlist"."watchlists"("user_id", "name");

-- AddForeignKey
ALTER TABLE "ai"."ai_evaluations" ADD CONSTRAINT "fk_ai_evaluations_generation_id" FOREIGN KEY ("generation_id") REFERENCES "ai"."ai_generations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ai"."ai_feedback" ADD CONSTRAINT "fk_ai_feedback_generation_id" FOREIGN KEY ("generation_id") REFERENCES "ai"."ai_generations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ai"."ai_feedback" ADD CONSTRAINT "fk_ai_feedback_user_id" FOREIGN KEY ("user_id") REFERENCES "system"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ai"."ai_generations" ADD CONSTRAINT "fk_ai_generations_user_id" FOREIGN KEY ("user_id") REFERENCES "system"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "evaluation"."asset_scores" ADD CONSTRAINT "fk_asset_scores_asset_id" FOREIGN KEY ("asset_id") REFERENCES "market"."asset_snapshot"("asset_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "evaluation"."feature_snapshots" ADD CONSTRAINT "fk_feature_snapshots_asset_id" FOREIGN KEY ("asset_id") REFERENCES "market"."asset_snapshot"("asset_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "market"."asset_features" ADD CONSTRAINT "fk_asset_features_asset_id" FOREIGN KEY ("asset_id") REFERENCES "market"."asset_snapshot"("asset_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "market"."asset_fundamentals" ADD CONSTRAINT "fk_asset_fundamentals_asset_id" FOREIGN KEY ("asset_id") REFERENCES "market"."asset_snapshot"("asset_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "market"."asset_health" ADD CONSTRAINT "fk_asset_health_asset_id" FOREIGN KEY ("asset_id") REFERENCES "market"."asset_snapshot"("asset_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "market"."market_themes" ADD CONSTRAINT "fk_market_themes_owner_id" FOREIGN KEY ("owner_id") REFERENCES "system"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "market"."price_history" ADD CONSTRAINT "fk_price_history_asset_id" FOREIGN KEY ("asset_id") REFERENCES "market"."assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "news"."asset_sentiment_snapshots" ADD CONSTRAINT "fk_asset_sentiment_snapshots_asset_id" FOREIGN KEY ("asset_id") REFERENCES "market"."assets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "news"."news_assets" ADD CONSTRAINT "fk_news_assets_asset_id" FOREIGN KEY ("asset_id") REFERENCES "market"."assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "news"."news_assets" ADD CONSTRAINT "fk_news_assets_news_id" FOREIGN KEY ("news_id") REFERENCES "news"."news"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification"."web_notifications" ADD CONSTRAINT "fk_web_notifications_user_id" FOREIGN KEY ("user_id") REFERENCES "system"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "portfolio"."binance_backfill_progress" ADD CONSTRAINT "fk_binance_backfill_progress_portfolio_id" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"."portfolios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "portfolio"."import_runs" ADD CONSTRAINT "fk_import_runs_portfolio_id" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"."portfolios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "portfolio"."positions" ADD CONSTRAINT "fk_positions_asset_id" FOREIGN KEY ("asset_id") REFERENCES "market"."asset_snapshot"("asset_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "portfolio"."positions" ADD CONSTRAINT "fk_positions_portfolio_id" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"."portfolios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "portfolio"."snapshots" ADD CONSTRAINT "fk_snapshots_portfolio_id" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"."portfolios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "portfolio"."transactions" ADD CONSTRAINT "fk_transactions_asset_id" FOREIGN KEY ("asset_id") REFERENCES "market"."asset_snapshot"("asset_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "portfolio"."transactions" ADD CONSTRAINT "fk_transactions_import_run_id" FOREIGN KEY ("import_run_id") REFERENCES "portfolio"."import_runs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "portfolio"."transactions" ADD CONSTRAINT "fk_transactions_portfolio_id" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"."portfolios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "portfolio"."transactions" ADD CONSTRAINT "fk_transactions_recommendation_id" FOREIGN KEY ("recommendation_id") REFERENCES "recommendation"."recommendations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recommendation"."recommendation_explanations" ADD CONSTRAINT "fk_recommendation_explanations_recommendation_id" FOREIGN KEY ("recommendation_id") REFERENCES "recommendation"."recommendations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recommendation"."recommendation_outcomes" ADD CONSTRAINT "fk_recommendation_outcomes_ledger_transaction_id" FOREIGN KEY ("ledger_transaction_id") REFERENCES "portfolio"."transactions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recommendation"."recommendation_outcomes" ADD CONSTRAINT "fk_recommendation_outcomes_recommendation_id" FOREIGN KEY ("recommendation_id") REFERENCES "recommendation"."recommendations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recommendation"."recommendations" ADD CONSTRAINT "fk_recommendations_asset_id" FOREIGN KEY ("asset_id") REFERENCES "market"."asset_snapshot"("asset_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "system"."audit_logs" ADD CONSTRAINT "fk_audit_logs_actor_id" FOREIGN KEY ("actor_id") REFERENCES "system"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "system"."provider_usage" ADD CONSTRAINT "fk_provider_usage_provider_id" FOREIGN KEY ("provider_id") REFERENCES "system"."providers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "system"."user_preferences" ADD CONSTRAINT "fk_user_preferences_user_id" FOREIGN KEY ("user_id") REFERENCES "system"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "watchlist"."watchlist_symbols" ADD CONSTRAINT "fk_watchlist_symbols_watchlist_id" FOREIGN KEY ("watchlist_id") REFERENCES "watchlist"."watchlists"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "watchlist"."watchlists" ADD CONSTRAINT "fk_watchlists_user_id" FOREIGN KEY ("user_id") REFERENCES "system"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


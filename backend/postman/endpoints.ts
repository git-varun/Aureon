// backend/postman/endpoints.ts
//
// Declarative inventory of every registered API route (see
// routes.snapshot.json, 131 entries) as a Postman/curl-friendly Endpoint
// object. `path` uses {{var}} placeholders instead of Express's :param
// syntax. body/query shapes were derived by reading each route handler's
// req.body/req.query usage and RequestValidationError checks — see
// task-2-report.md for the file-by-file notes.
export interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  folder: string;
  name: string;
  query?: Record<string, string>;
  body?: unknown;
  manual?: boolean;
  expectStatus: number[];
}

export const ENDPOINTS: Endpoint[] = [
  // --- ai ---
  { method: "POST", path: "/api/v1/ai/global", folder: "ai", name: "Generate global briefing", expectStatus: [200] },
  { method: "POST", path: "/api/v1/ai/weekly", folder: "ai", name: "Generate weekly briefing", expectStatus: [200] },
  { method: "POST", path: "/api/v1/ai/monthly", folder: "ai", name: "Generate monthly briefing", expectStatus: [200] },
  { method: "POST", path: "/api/v1/ai/qa", folder: "ai", name: "Ask Aureon Q&A", body: { context_type: "portfolio", context_id: "{{portfolioId}}", question: "How is my portfolio doing?" }, expectStatus: [200] },
  { method: "POST", path: "/api/v1/ai/feedback", folder: "ai", name: "Submit AI feedback", body: { generation_id: "{{aiGenerationId}}", rating: 1, comment: "Helpful" }, expectStatus: [200] },
  { method: "POST", path: "/api/v1/ai/recommendations/{{recommendationId}}/explain", folder: "ai", name: "Explain recommendation", expectStatus: [200] },
  { method: "GET", path: "/api/v1/analytics/ai/briefings", folder: "ai", name: "Get briefing history", query: { limit: "10" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/analytics/ai/single/{{symbol}}", folder: "ai", name: "Get single-asset take", expectStatus: [200] },
  { method: "POST", path: "/api/v1/analytics/ai/single/{{symbol}}", folder: "ai", name: "Generate single-asset take", expectStatus: [200] },
  { method: "GET", path: "/api/v1/analytics/ai/usage", folder: "ai", name: "Get AI usage summary", expectStatus: [200] },
  { method: "POST", path: "/api/v1/analytics/ai/news/batch", folder: "ai", name: "Dispatch news batch analysis", expectStatus: [200] },

  // --- intelligence ---
  { method: "GET", path: "/api/v1/intelligence/calibration", folder: "intelligence", name: "Get confidence calibration", expectStatus: [200] },
  { method: "GET", path: "/api/v1/intelligence/cash-opportunities", folder: "intelligence", name: "Get cash deployment opportunities", query: { portfolio_id: "{{portfolioId}}" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/intelligence/concentration", folder: "intelligence", name: "Get concentration analysis", query: { portfolio_id: "{{portfolioId}}" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/intelligence/diversification", folder: "intelligence", name: "Get diversification score", query: { portfolio_id: "{{portfolioId}}" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/intelligence/diversification/trend", folder: "intelligence", name: "Get diversification trend", query: { portfolio_id: "{{portfolioId}}", days: "30" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/intelligence/goals", folder: "intelligence", name: "Get goal progress metrics", query: { portfolio_id: "{{portfolioId}}" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/intelligence/outcomes", folder: "intelligence", name: "Get recommendation outcomes", expectStatus: [200] },
  { method: "GET", path: "/api/v1/intelligence/portfolio-health", folder: "intelligence", name: "Get investor health score", query: { portfolio_id: "{{portfolioId}}" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/intelligence/portfolio-health/trend", folder: "intelligence", name: "Get portfolio health trend", query: { portfolio_id: "{{portfolioId}}", days: "30" }, expectStatus: [200] },

  // --- recommendations ---
  { method: "POST", path: "/api/v1/aureon/recommendations/seed", folder: "recommendations", name: "Seed recommendations", expectStatus: [200] },
  { method: "GET", path: "/api/v1/recommendation/recommendations", folder: "recommendations", name: "List recommendations", query: { status: "active" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/recommendation/recommendations/{{recommendationId}}", folder: "recommendations", name: "Get recommendation", expectStatus: [200, 404] },
  { method: "POST", path: "/api/v1/recommendation/recommendations/{{recommendationId}}/apply", folder: "recommendations", name: "Apply recommendation", query: { portfolio_id: "{{portfolioId}}" }, expectStatus: [200] },
  { method: "POST", path: "/api/v1/recommendation/recommendations/{{recommendationId}}/dismiss", folder: "recommendations", name: "Dismiss recommendation", query: { reason: "not interested" }, expectStatus: [200] },
  { method: "POST", path: "/api/v1/recommendation/recommendations/{{recommendationId}}/undo", folder: "recommendations", name: "Undo recommendation", expectStatus: [200] },
  { method: "POST", path: "/api/v1/recommendation/recommendations/generate", folder: "recommendations", name: "Generate recommendations", expectStatus: [200, 201] },

  // --- evaluation ---
  { method: "GET", path: "/api/v1/evaluation/assets/{{assetId}}/scores", folder: "evaluation", name: "Get asset scores", query: { model_version: "v1.0.0" }, expectStatus: [200, 404] },

  // --- assets ---
  { method: "GET", path: "/api/v1/assets", folder: "assets", name: "Search assets", query: { search: "AAPL" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/assets/{{symbol}}/chart", folder: "assets", name: "Get asset chart", query: { days: "365" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/assets/{{symbol}}/fundamentals", folder: "assets", name: "Get asset fundamentals", expectStatus: [200] },
  { method: "GET", path: "/api/v1/assets/{{symbol}}/quote", folder: "assets", name: "Get asset quote", expectStatus: [200, 404] },
  { method: "GET", path: "/api/v1/assets/batch", folder: "assets", name: "Get assets batch", query: { symbols: "{{symbol}}" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/aureon/assets/{{ticker}}", folder: "assets", name: "Get Aureon asset", query: { portfolio_id: "{{portfolioId}}" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/signals/{{symbol}}", folder: "assets", name: "Get signal", expectStatus: [200] },
  { method: "POST", path: "/api/v1/signals/generate/{{symbol}}", folder: "assets", name: "Generate signal (not implemented)", expectStatus: [501] },

  // --- market ---
  { method: "GET", path: "/api/v1/market/assets/{{assetId}}/features", folder: "market", name: "Get asset features", expectStatus: [200] },
  { method: "GET", path: "/api/v1/market/assets/{{assetId}}/snapshot", folder: "market", name: "Get asset snapshot", expectStatus: [200] },
  { method: "GET", path: "/api/v1/market/indices", folder: "market", name: "Get indices", expectStatus: [200] },
  { method: "GET", path: "/api/v1/market/movers", folder: "market", name: "Get movers", expectStatus: [200] },
  { method: "POST", path: "/api/v1/market/refresh", folder: "market", name: "Refresh market data", expectStatus: [200] },
  { method: "GET", path: "/api/v1/market/search", folder: "market", name: "Search market", query: { q: "AAPL" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/market/universe", folder: "market", name: "Get universe", expectStatus: [200] },
  { method: "POST", path: "/api/v1/market/symbols/{{symbol}}/backfill", folder: "market", name: "Backfill symbol", expectStatus: [200] },

  // --- sectors ---
  { method: "GET", path: "/api/v1/market/sectors", folder: "sectors", name: "List sectors", expectStatus: [200] },
  { method: "GET", path: "/api/v1/market/sectors/{{sectorName}}", folder: "sectors", name: "Get sector detail", expectStatus: [200] },

  // --- themes ---
  { method: "GET", path: "/api/v1/market/themes", folder: "themes", name: "List themes", expectStatus: [200] },
  { method: "GET", path: "/api/v1/market/themes-for/{{symbol}}", folder: "themes", name: "Get themes for symbol", expectStatus: [200] },
  { method: "DELETE", path: "/api/v1/market/themes/{{themeId}}", folder: "themes", name: "Delete theme", expectStatus: [200, 403] },
  { method: "GET", path: "/api/v1/market/themes/{{themeId}}", folder: "themes", name: "Get theme detail", expectStatus: [200] },
  { method: "PUT", path: "/api/v1/market/themes/{{themeId}}", folder: "themes", name: "Update theme", body: { name: "Renamed Theme", weights: { AAPL: 0.5, MSFT: 0.5 } }, expectStatus: [200, 403] },
  { method: "POST", path: "/api/v1/market/themes/{{themeId}}/fork", folder: "themes", name: "Fork theme", body: { name: "Forked Theme" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/market/themes/{{themeId}}/nav", folder: "themes", name: "Get theme NAV", query: { days: "365" }, expectStatus: [200, 404, 422] },
  { method: "GET", path: "/api/v1/market/themes/{{themeId}}/signals", folder: "themes", name: "Get theme signals", expectStatus: [200] },

  // --- systemHealth ---
  { method: "GET", path: "/api/v1/health", folder: "systemHealth", name: "Get health", expectStatus: [200] },
  { method: "GET", path: "/api/v1/health/score", folder: "systemHealth", name: "Get health score", expectStatus: [200] },

  // --- monitoring ---
  { method: "GET", path: "/api/v1/monitoring/assets/{{assetId}}/health", folder: "monitoring", name: "Get asset health", expectStatus: [200] },
  { method: "GET", path: "/api/v1/monitoring/dependencies", folder: "monitoring", name: "Get dependencies status", expectStatus: [200] },
  { method: "GET", path: "/api/v1/monitoring/failed-ingestions", folder: "monitoring", name: "Get failed ingestions", query: { limit: "50", offset: "0" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/monitoring/health/aggregate", folder: "monitoring", name: "Get aggregate health", expectStatus: [200] },
  { method: "GET", path: "/api/v1/monitoring/observability", folder: "monitoring", name: "Get observability data", expectStatus: [200] },
  { method: "GET", path: "/api/v1/monitoring/positions/quote-integrity", folder: "monitoring", name: "Check position quote integrity", expectStatus: [200] },
  { method: "GET", path: "/api/v1/monitoring/providers", folder: "monitoring", name: "Get provider health", expectStatus: [200] },
  { method: "GET", path: "/api/v1/monitoring/transactions/integrity", folder: "monitoring", name: "Check transaction integrity", expectStatus: [200] },

  // --- news ---
  { method: "GET", path: "/api/v1/news", folder: "news", name: "Get recent news", expectStatus: [200] },
  { method: "GET", path: "/api/v1/news/{{symbol}}", folder: "news", name: "Get news for symbol", expectStatus: [200] },
  { method: "GET", path: "/api/v1/news/health", folder: "news", name: "Get news module health", expectStatus: [200] },

  // --- notifications ---
  { method: "GET", path: "/api/v1/notifications", folder: "notifications", name: "List notifications", expectStatus: [200] },
  { method: "POST", path: "/api/v1/notifications", folder: "notifications", name: "Create notification", body: { title: "Test", message: "Test notification", type: "info" }, expectStatus: [200] },
  { method: "PUT", path: "/api/v1/notifications/{{notificationId}}/read", folder: "notifications", name: "Mark notification read", expectStatus: [200, 404] },
  { method: "PUT", path: "/api/v1/notifications/mark-all-read", folder: "notifications", name: "Mark all notifications read", body: ["{{notificationId}}"], expectStatus: [200] },

  // --- backup ---
  { method: "GET", path: "/api/v1/portfolio/backup", folder: "backup", name: "Export backup", expectStatus: [200] },
  { method: "POST", path: "/api/v1/portfolio/restore", folder: "backup", name: "Restore backup", manual: true, expectStatus: [200] },

  // --- portfolios ---
  { method: "GET", path: "/api/v1/portfolio/portfolios", folder: "portfolios", name: "List portfolios", query: { include_archived: "false" }, expectStatus: [200] },
  { method: "POST", path: "/api/v1/portfolio/portfolios", folder: "portfolios", name: "Create portfolio", body: { name: "{{$randomWord}} Test Portfolio" }, expectStatus: [201] },
  { method: "DELETE", path: "/api/v1/portfolio/portfolios/{{portfolioId}}", folder: "portfolios", name: "Delete portfolio", expectStatus: [200, 409] },
  { method: "GET", path: "/api/v1/portfolio/portfolios/{{portfolioId}}", folder: "portfolios", name: "Get portfolio", expectStatus: [200, 404] },
  { method: "PUT", path: "/api/v1/portfolio/portfolios/{{portfolioId}}", folder: "portfolios", name: "Rename portfolio", body: { name: "Renamed Test Portfolio" }, expectStatus: [200] },
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/archive", folder: "portfolios", name: "Archive portfolio", expectStatus: [200] },
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/unarchive", folder: "portfolios", name: "Unarchive portfolio", expectStatus: [200] },

  // --- positions ---
  { method: "GET", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/history", folder: "positions", name: "Get portfolio history", query: { days: "90" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/positions", folder: "positions", name: "List positions", expectStatus: [200] },
  { method: "GET", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/snapshot", folder: "positions", name: "Get snapshot", expectStatus: [200] },
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/snapshot", folder: "positions", name: "Regenerate snapshot", expectStatus: [200] },

  // --- imports ---
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/import", folder: "imports", name: "Import transactions file", manual: true, expectStatus: [200] },
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/import/cdsl", folder: "imports", name: "Import CDSL CAS", manual: true, expectStatus: [200] },
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/import/epf", folder: "imports", name: "Import EPF statement", manual: true, expectStatus: [200] },
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/import/groww/holdings", folder: "imports", name: "Import Groww holdings", manual: true, expectStatus: [200] },
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/import/groww/mf-holdings", folder: "imports", name: "Import Groww MF holdings", manual: true, expectStatus: [200] },
  { method: "GET", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/import/history", folder: "imports", name: "Get import history", expectStatus: [200] },
  { method: "GET", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/import/history/{{importRunId}}/transactions", folder: "imports", name: "Get import run transactions", expectStatus: [200, 404] },
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/import/nps", folder: "imports", name: "Import NPS statement", manual: true, expectStatus: [200] },
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/manual-assets", folder: "imports", name: "Add manual asset", body: { name: "My House", asset_class: "real_estate", quantity: 1, current_value: 5000000 }, expectStatus: [200] },
  { method: "PUT", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/manual-assets/{{symbol}}/valuation", folder: "imports", name: "Update manual asset valuation", body: { new_value: 5100000 }, expectStatus: [200] },

  // --- sync ---
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/sync/binance/backfill", folder: "sync", name: "Backfill Binance spot history", expectStatus: [200, 404] },
  { method: "GET", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/sync/binance/backfill/status", folder: "sync", name: "Get Binance backfill status", expectStatus: [200, 404] },
  { method: "POST", path: "/api/v1/portfolio/sync", folder: "sync", name: "Trigger broker sync", body: { broker: "zerodha" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/portfolio/sync/status", folder: "sync", name: "Get sync status", expectStatus: [200] },

  // --- transactions ---
  { method: "GET", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/transactions", folder: "transactions", name: "List transactions", expectStatus: [200] },
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/transactions", folder: "transactions", name: "Create transaction", body: { symbol: "AAPL", transaction_type: "BUY", quantity: 10, price: 150.5, transaction_date: "2026-01-01T00:00:00Z", fees: 0, taxes: 0 }, expectStatus: [201] },
  { method: "DELETE", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/transactions/{{txnId}}", folder: "transactions", name: "Delete transaction", expectStatus: [200, 404] },
  { method: "GET", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/transactions/{{txnId}}", folder: "transactions", name: "Get transaction", expectStatus: [200, 404] },
  { method: "PUT", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/transactions/{{txnId}}", folder: "transactions", name: "Update transaction", body: { quantity: 12, price: 155 }, expectStatus: [200, 404] },
  { method: "GET", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/transactions/broker-coverage", folder: "transactions", name: "Get broker transaction coverage", expectStatus: [200] },

  // --- jobs ---
  { method: "GET", path: "/api/v1/config/jobs", folder: "jobs", name: "List jobs", expectStatus: [200] },
  { method: "PUT", path: "/api/v1/config/jobs/{{jobName}}", folder: "jobs", name: "Update job config", body: { enabled: true }, expectStatus: [200, 404] },
  { method: "GET", path: "/api/v1/config/jobs/{{jobName}}/logs", folder: "jobs", name: "Get job logs", query: { limit: "50", offset: "0" }, expectStatus: [200] },
  { method: "POST", path: "/api/v1/config/jobs/{{jobName}}/run", folder: "jobs", name: "Trigger job run", expectStatus: [200, 404] },
  { method: "GET", path: "/api/v1/config/jobs/logs", folder: "jobs", name: "Get all job logs", query: { limit: "50", offset: "0" }, expectStatus: [200] },

  // --- providers ---
  { method: "GET", path: "/api/v1/config/allocation_targets", folder: "providers", name: "Get allocation targets", expectStatus: [200] },
  { method: "PUT", path: "/api/v1/config/allocation_targets/{{assetClass}}", folder: "providers", name: "Upsert allocation target", body: { target_pct: 0.2 }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/config/providers", folder: "providers", name: "List providers", expectStatus: [200] },
  { method: "PUT", path: "/api/v1/config/providers/{{providerName}}", folder: "providers", name: "Update provider config", body: { enabled: true }, expectStatus: [200] },
  { method: "POST", path: "/api/v1/config/providers/{{providerName}}/health-check", folder: "providers", name: "Provider health check", expectStatus: [200] },
  { method: "PUT", path: "/api/v1/config/providers/{{providerName}}/keys", folder: "providers", name: "Set provider key", body: { key_name: "{{keyName}}", value: "test-value" }, expectStatus: [200, 404] },
  { method: "DELETE", path: "/api/v1/config/providers/{{providerName}}/keys/{{keyName}}", folder: "providers", name: "Remove provider key", expectStatus: [200, 404] },
  { method: "GET", path: "/api/v1/config/providers/zerodha/oauth/callback", folder: "providers", name: "Zerodha OAuth callback", manual: true, expectStatus: [200, 400] },
  { method: "GET", path: "/api/v1/config/providers/zerodha/oauth/login-url", folder: "providers", name: "Zerodha OAuth login URL", manual: true, expectStatus: [200] },

  // --- reset ---
  { method: "POST", path: "/api/v1/reset", folder: "reset", name: "Run data reset", manual: true, body: { scopes: ["notifications"], backup_receipt: "{{backupReceipt}}" }, expectStatus: [200, 409] },
  { method: "GET", path: "/api/v1/reset/preview", folder: "reset", name: "Preview data reset", query: { scopes: "notifications" }, expectStatus: [200] },
  { method: "GET", path: "/api/v1/reset/scopes", folder: "reset", name: "List reset scopes", expectStatus: [200] },

  // --- users ---
  { method: "GET", path: "/api/v1/users/me", folder: "users", name: "Get current user profile", expectStatus: [200] },
  { method: "PUT", path: "/api/v1/users/me", folder: "users", name: "Update current user profile", body: { first_name: "Test", risk_profile: "moderate" }, expectStatus: [200] },

  // --- watchlist ---
  { method: "GET", path: "/api/v1/watchlist", folder: "watchlist", name: "List watchlists", expectStatus: [200] },
  { method: "POST", path: "/api/v1/watchlist", folder: "watchlist", name: "Create watchlist", body: { name: "{{$randomWord}} Test Watchlist" }, expectStatus: [201] },
  { method: "DELETE", path: "/api/v1/watchlist/{{watchlistId}}", folder: "watchlist", name: "Delete watchlist", expectStatus: [204] },
  { method: "PUT", path: "/api/v1/watchlist/{{watchlistId}}", folder: "watchlist", name: "Rename watchlist", body: { name: "Renamed Watchlist" }, expectStatus: [200] },
  { method: "POST", path: "/api/v1/watchlist/{{watchlistId}}/symbols", folder: "watchlist", name: "Add symbol to watchlist", body: { symbol: "AAPL" }, expectStatus: [200] },
  { method: "DELETE", path: "/api/v1/watchlist/{{watchlistId}}/symbols/{{symbol}}", folder: "watchlist", name: "Remove symbol from watchlist", expectStatus: [200, 404] },
  { method: "DELETE", path: "/api/v1/watchlist/{{watchlistId}}/symbols/{{symbol}}/alert", folder: "watchlist", name: "Clear symbol alert", expectStatus: [200, 404] },
  { method: "PUT", path: "/api/v1/watchlist/{{watchlistId}}/symbols/{{symbol}}/alert", folder: "watchlist", name: "Set symbol alert", body: { price: 200 }, expectStatus: [200, 404] },
];

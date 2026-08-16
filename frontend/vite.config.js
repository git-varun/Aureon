import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Node backend-node target. Task 10 (2026-08-16) deleted the Python
// backend/ entirely, so every route below — including the catch-all '/api'
// line — now targets Node; there is no other backend left to route to.
const apiNodeProxyTarget = process.env.VITE_API_NODE_PROXY_TARGET || 'http://localhost:8010'
const frontendPort = parseInt(process.env.FRONTEND_PORT || '3000', 10)
const isDocker = process.env.RUNNING_IN_DOCKER === 'true'

// https://vite.dev/config/
export default defineConfig({
    cacheDir: isDocker ? 'node_modules/.vite-docker' : 'node_modules/.vite-local',
    plugins: [react()],
    resolve: {
        alias: {'@': path.resolve(__dirname, 'src')},
    },
    server: {
        host: '0.0.0.0',
        port: frontendPort,
        proxy: {
            // More specific paths must be listed before '/api' — Vite/
            // http-proxy-middleware matches proxy keys in object insertion
            // order and uses the first prefix match.
            '/api/v1/watchlist': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Task 8: portfolio-health/trend and diversification/trend are now
            // full ports too (backend-node/src/lib/ai/intelligence.ts) — no
            // dedicated guard entries needed any more since Vite/http-proxy-
            // middleware's string-prefix match sends both the base path and
            // its /trend sub-path to the same (now-correct) Node target below.
            '/api/v1/intelligence/portfolio-health': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            '/api/v1/intelligence/diversification': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            '/api/v1/intelligence/concentration': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            '/api/v1/intelligence/cash-opportunities': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            '/api/v1/intelligence/calibration': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            '/api/v1/intelligence/outcomes': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Monitoring is a full port (all routes exist in Node) so the
            // whole module prefix is safe to cut over in one line, same as
            // watchlist above.
            '/api/v1/monitoring': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Evaluation (GET /assets/{asset_id}/scores) — full port, single
            // route module (backend-node/src/routes/evaluation/evaluation.ts).
            '/api/v1/evaluation': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Phase 10 wave 3: Portfolio/Positions/Transactions CRUD. Scoped
            // to '/api/v1/portfolio/portfolios' specifically, NOT the whole
            // '/api/v1/portfolio' module. Note '/api/v1/portfolio/portfolios/
            // :id/sync/binance/backfill(/status)?' is a genuine sub-path of
            // this prefix (not a sibling, despite what an earlier version of
            // this comment claimed) so it already routed to Node under this
            // one line — no separate guard entry was ever needed for it.
            // '/api/v1/portfolio/sync' and '/api/v1/portfolio/sync/status'
            // ARE true siblings (not sub-paths of 'portfolios') and needed
            // an entry below — one '/api/v1/portfolio/sync' prefix line
            // covers both, since '/status' is itself a sub-path of '/sync'.
            //
            // Task 10 (2026-08-16, explicit user sign-off — see
            // task10-brief.md's scope decision): backend/ is being deleted
            // in this same change, so every route that was "reviewed but
            // not live-credential-verified" is cut over now rather than
            // left pointed at a Python backend that no longer exists.
            // Zerodha/Groww/Binance sync, futures positions, trade-history
            // cost basis, and the Spot backfill all have a Node
            // implementation (backend-node/src/lib/broker/**, src/jobs/
            // {syncZerodha,syncGroww,syncBinance,backfillBinanceSpot}.ts)
            // with unit + integration test coverage, but NO live broker
            // credentials were available to verify a real holdings/trade-
            // history sync against Zerodha/Groww/Binance's actual servers —
            // see task4-report.md for the full audit. This is real cost-
            // basis/position data; the user will verify it manually against
            // real accounts after this lands, per the scope decision.
            // '/api/v1/portfolio/backup' and '/api/v1/portfolio/restore' —
            // also siblings — are cut over separately below, wave 4.
            '/api/v1/portfolio/portfolios': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Siblings of 'portfolios' (see note above) — cut over unverified
            // per the Task 10 scope decision, same risk acceptance as above.
            '/api/v1/portfolio/sync': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Phase 10 wave 4: Import (already covered above — imports.ts is
            // mounted under 'portfolios' too), Settings/Providers/Job-config,
            // Export, Danger Zone, Restore.
            //
            // The Zerodha OAuth *callback* is a sub-path of '/config' — kept
            // as its own entry for documentation even though it now targets
            // the same place as the blanket '/api/v1/config' line below.
            // It's a live external API integration (token exchange against
            // Zerodha's servers): Task 4 ported it
            // (backend-node/src/routes/settings/providers.ts, byte-for-byte
            // checksum parity unit-tested against Python's real sha256
            // output) but no live Zerodha credentials were available to
            // verify the real checksum exchange against Zerodha's servers —
            // see task4-report.md. Task 10 (2026-08-16, explicit user
            // sign-off) cuts it over unverified anyway, since backend/ is
            // deleted in the same change and leaving it on Python would
            // route this unauthenticated, real-broker-session-creating
            // endpoint to nothing. The user will verify it manually against
            // a real Zerodha account after this lands.
            '/api/v1/config/providers/zerodha/oauth/callback': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Every other /config/** route (providers CRUD, zerodha
            // login-url, job config, allocation_targets) now has a Node
            // port — see backend-node/src/routes/settings/{providers,jobs}.ts.
            '/api/v1/config': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Danger Zone. Destructive by design (scoped data reset) — see
            // backend-node/src/routes/settings/reset.ts /
            // lib/settings/dataReset.ts, live-verified against Python's exact
            // deletion behavior (incl. ThemeWeight-before-MarketTheme
            // ordering) on throwaway data before this cutover.
            '/api/v1/reset': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            '/api/v1/notifications': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Profile (GET/PUT /users/me) — full port since an earlier
            // phase (routes/users/users.ts), just never routed until now.
            // apiService.js's DELETE /users/me (deleteAccount) has no
            // Python route either — pre-existing frontend/backend mismatch,
            // not something this migration introduces or should paper over.
            '/api/v1/users': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Export (backup) + Restore — full ports since Phase 7, only now
            // cut over. Restore re-verified under real routed traffic this
            // wave (double-restore idempotency, rollback-on-failure) — not
            // just re-trusting the earlier direct-API verification. The
            // legacy flat-transactions/default-Portfolio path was NOT
            // re-verified live here (this env's "Default Portfolio" IS the
            // real 53-position portfolio — no safe throwaway target for that
            // specific branch); it's still covered by Wave 3's 11 restore
            // unit tests against the isolated test DB, unchanged since.
            '/api/v1/portfolio/backup': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            '/api/v1/portfolio/restore': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Phase 10 wave 5 (final wave): AI briefings/Q&A/feedback/explain
            // (all of /api/v1/ai/**) are a full port — safe as one blanket
            // prefix line, same pattern as monitoring/watchlist above.
            '/api/v1/ai': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Task 5: single-asset-take and usage-summary are now a full
            // port too — every /api/v1/analytics/ai/** sub-path (briefings,
            // single/{symbol}, usage, news/batch) is on Node. Safe as one
            // blanket prefix line, same pattern as monitoring/watchlist.
            '/api/v1/analytics/ai': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Bare (non-/recommendation-prefixed) seed route — a real gap
            // this wave's route inventory found (frontend's AdminPanel calls
            // it, Phase 8 never ported it). Listed as an exact path, not a
            // '/api/v1/aureon' prefix.
            '/api/v1/aureon/recommendations/seed': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Market catalog + assets full port (themes, indices, movers,
            // sectors, symbols, search, universe, signals) — the last
            // Python-exclusive slice of app/modules/market/api/{assets,
            // market}.py. '/aureon/assets/{ticker}' (market's, distinct
            // from the recommendations-seed route above despite sharing the
            // '/aureon' segment) is a full port too, see backend-node/src/
            // routes/market/assets.ts.
            '/api/v1/assets': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            '/api/v1/signals': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            '/api/v1/aureon/assets': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // POST /market/symbols/{symbol}/backfill (deferred since Task 1
            // because generate_features had no Node runner at the time) is
            // now ported too — Task 10 added the route
            // (backend-node/src/routes/market/market.ts's triggerBackfill,
            // reusing the adminBackfillAssets runner Task 7 already built)
            // during this task's route-inventory audit, since it's actively
            // called by the frontend (AssetDetail.jsx's "Trigger Historical
            // Backfill" button) and would otherwise route to nothing once
            // backend/ is deleted. No separate guard entry needed any more —
            // it now falls under the blanket '/api/v1/market' line below,
            // same as every other market route.
            // Every other /market/** route (sectors, indices, movers,
            // search, universe, refresh, asset snapshot/features, full
            // themes CRUD+fork+nav+signals, themes-for) is a full port —
            // see backend-node/src/routes/market/{sectors,market,themes}.ts.
            '/api/v1/market': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Task 5: apply/dismiss/undo are now a full port too (the org-
            // recommendations Redis cache invalidation they need lives in
            // backend-node/src/lib/portfolioCache.ts). Live-verified against
            // real recommendation rows in the real DB — apply (real
            // Transaction + audit log + cache invalidation), dismiss, undo
            // (transaction delete + outcome reset), and the 400/404 error
            // paths. Task 8 closed the remaining gap: apply/dismiss/undo (and
            // materialize_for_asset) now call update_financial_intelligence_
            // pipeline too, wrapped in try/catch so a pipeline failure never
            // blocks the primary action — see backend-node/src/lib/ai/
            // intelligence.ts and task8-report.md. generate + list were
            // already a full port; the whole '/api/v1/recommendation' prefix
            // is safe as one blanket line.
            '/api/v1/recommendation': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // News (GET /news, GET /news/{symbol}) — a full port
            // (backend-node/src/routes/news/news.ts) since Task 11's
            // news-refresh schedule cutover, but that task only moved the
            // beat_schedule/worker side; the HTTP route itself was never
            // added here and was silently falling through to the catch-all
            // below. Found and fixed during Task 10's route-inventory audit.
            '/api/v1/news': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Task 10 (2026-08-16): backend/ is deleted in this same change,
            // so the catch-all can no longer point at Python — every route
            // not explicitly listed above now falls through to Node too.
            '/api': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
        },
    },
})

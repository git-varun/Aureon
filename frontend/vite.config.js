import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8001'
// Node backend-node cutover target — only routes explicitly listed below
// (currently just /api/v1/watchlist, Phase 10's first cutover wave) go
// here. Everything else keeps hitting apiProxyTarget (Python). To roll a
// module back, delete its line from the proxy map below; to add the next
// module, add one line here — this is the per-module routing switch, not
// apiService.js or any per-request logic.
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
            // '/api/v1/portfolio' module — '/api/v1/portfolio/sync',
            // '/api/v1/portfolio/sync/status', and the binance-backfill
            // sub-routes are siblings of 'portfolios' (not sub-paths of it,
            // so no prefix-collision risk either way) and stay on Python.
            // Task 4 (real-money broker sync) DID port these — Zerodha/
            // Groww/Binance sync, futures positions, trade-history cost
            // basis, and the Spot backfill all have a Node implementation
            // (backend-node/src/lib/broker/**, src/jobs/{syncZerodha,
            // syncGroww,syncBinance,backfillBinanceSpot}.ts) with unit +
            // integration test coverage. It is deliberately NOT cut over
            // here: no broker had live credentials configured in the audit
            // environment to verify a real holdings/trade-history sync
            // against Zerodha/Groww/Binance's actual servers, and this is
            // real cost-basis/position data — see task4-report.md for the
            // full audit. Flip this line only after a live sync has been
            // verified against a real connected account for the broker(s)
            // being cut over.
            // '/api/v1/portfolio/backup' and '/api/v1/portfolio/restore' —
            // also siblings — are cut over separately below, wave 4.
            '/api/v1/portfolio/portfolios': {
                target: apiNodeProxyTarget,
                changeOrigin: true,
            },
            // Phase 10 wave 4: Import (already covered above — imports.ts is
            // mounted under 'portfolios' too), Settings/Providers/Job-config,
            // Export, Danger Zone, Restore.
            //
            // The Zerodha OAuth *callback* is a sub-path of '/config' that
            // must stay on Python — same class of prefix-collision guard the
            // intelligence /trend endpoints used to need (see Task 8): it's a
            // live external API integration (token exchange against
            // Zerodha's servers). Task 4
            // ported it (backend-node/src/routes/settings/providers.ts,
            // byte-for-byte checksum parity unit-tested against Python's
            // real sha256 output) but did NOT cut it over here — no live
            // Zerodha credentials were available to verify the real checksum
            // exchange against Zerodha's servers, and this endpoint is
            // intentionally unauthenticated and creates a real broker
            // session, so it stays proxied to Python until that's done — see
            // task4-report.md. MUST precede the '/api/v1/config' line below
            // or the broader prefix would swallow it.
            '/api/v1/config/providers/zerodha/oauth/callback': {
                target: apiProxyTarget,
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
            // POST /market/symbols/{symbol}/backfill stays on Python: its
            // real effect (admin_backfill_assets -> generate_features) needs
            // the feature/signal-generation worker pipeline, which isn't
            // ported to Node in this phase. Must precede the blanket
            // '/api/v1/market' line below or that prefix would swallow it.
            '/api/v1/market/symbols': {
                target: apiProxyTarget,
                changeOrigin: true,
            },
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
            '/api': {
                target: apiProxyTarget,
                changeOrigin: true,
            },
        },
    },
})

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
// Phase 10 wave 2 note: two /api/v1/intelligence sub-paths
// (portfolio-health/trend, diversification/trend) are deliberately NOT
// routed to Node — those endpoints aren't ported yet (Phase 8 deferred
// them) and stay on Python. Because Vite/http-proxy-middleware matches
// proxy keys by string prefix, '/api/v1/intelligence/portfolio-health'
// would otherwise also match '.../portfolio-health/trend' — so the two
// trend guards below MUST stay listed (and stay ahead of the shorter
// intelligence entries) rather than being deleted as "redundant" with
// the '/api' catch-all.
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
            // Trend endpoints stay on Python — not ported in Node yet (see
            // note above). Must precede the shorter intelligence prefixes
            // below since those would otherwise prefix-match these too.
            '/api/v1/intelligence/portfolio-health/trend': {
                target: apiProxyTarget,
                changeOrigin: true,
            },
            '/api/v1/intelligence/diversification/trend': {
                target: apiProxyTarget,
                changeOrigin: true,
            },
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
            // Phase 10 wave 3: Portfolio/Positions/Transactions CRUD. Scoped
            // to '/api/v1/portfolio/portfolios' specifically, NOT the whole
            // '/api/v1/portfolio' module — '/api/v1/portfolio/sync' and
            // '/api/v1/portfolio/sync/status' are siblings of 'portfolios'
            // (not sub-paths of it, so no prefix-collision risk either way)
            // and stay on Python (broker-sync orchestration isn't ported).
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
            // must stay on Python — same class of near-miss as the
            // intelligence /trend guards above: it's a live external API
            // integration (token exchange against Zerodha's servers) with no
            // Node port, same reasoning as wave 3's binance-backfill gap.
            // MUST precede the '/api/v1/config' line below or the broader
            // prefix would swallow it.
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
            '/api': {
                target: apiProxyTarget,
                changeOrigin: true,
            },
        },
    },
})

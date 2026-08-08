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
            '/api': {
                target: apiProxyTarget,
                changeOrigin: true,
            },
        },
    },
})

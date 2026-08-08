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
            '/api': {
                target: apiProxyTarget,
                changeOrigin: true,
            },
        },
    },
})

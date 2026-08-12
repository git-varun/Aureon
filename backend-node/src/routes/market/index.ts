// assetsRouter mounts at /api/v1 (matches Python's assets.router prefix).
export { assetsRouter as marketAssetsRouter } from "./assets";
// sectorsRouter, marketRouter, themesRouter all mount at /api/v1/market
// (matches Python's market.router prefix). Split into separate files
// mirroring the audit's grouping: sectors (pre-existing), indices/movers/
// snapshot/features/search/universe/refresh (market.ts), themes CRUD+nav+
// fork+themes-for (themes.ts) — kept apart from market.ts since the theme
// business logic alone is as large as everything else in market.py combined.
export { sectorsRouter as marketSectorsRouter } from "./sectors";
export { marketRouter } from "./market";
export { themesRouter } from "./themes";

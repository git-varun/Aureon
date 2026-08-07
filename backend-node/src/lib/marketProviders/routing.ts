import { SYMBOL_TO_COINGECKO_ID } from "./coingecko";

// Asset classes with no ISIN/ticker coverage on Yahoo — mutual_fund gets its
// NAV from AMFI (separate ingestion path); nps/epf get theirs from
// statement-import wiring or don't have a live source at all (epf).
const NO_YAHOO_COVERAGE_ASSET_CLASSES = new Set(["mutual_fund", "nps", "epf"]);
// MANUAL- prefixed symbols (manually-valued assets) use a free-text
// asset_class, so they're excluded by symbol prefix rather than the set above.

/** Port of _skip_quote_ingestion — single source of truth for "should this
 * (symbol, asset_class) be skipped before ever reaching resolveQuoteProvider". */
export function skipQuoteIngestion(symbol: string, assetClass: string | null): boolean {
  return (assetClass !== null && NO_YAHOO_COVERAGE_ASSET_CLASSES.has(assetClass)) || symbol.startsWith("MANUAL-");
}

// Ordered fallback candidates per primary provider, tried on a ProviderError
// from the one before it. Yahoo covers global equity/crypto-spot symbols;
// Finnhub/Polygon are US-quote APIs, so they're only meaningful fallbacks for
// the subset of Yahoo's symbols that also resolve on a US ticker.
// binance_price has no listed fallback: crypto-futures symbols don't resolve
// on any other registered provider.
// nse_direct falls back to yahoo (needed for fundamentals/sector either way,
// covers .NS too) rather than finnhub/polygon, which have no Indian-equity
// coverage at all.
// finnhub is primary for global (non-.NS/.BO) equities, with twelvedata/
// alphavantage/yahoo as fallbacks in that order — live-tested free-tier
// budgets (finnhub 60/min, twelvedata 8/min, alphavantage 25/day) drove the
// ordering, not alphabetical/arbitrary placement. yahoo stays last as the
// unlimited, always-available final fallback.
// coingecko falls back to yahoo (yfinance genuinely serves BTC-USD-style
// tickers) rather than finnhub/twelvedata/alphavantage, which are equity-only
// and were confirmed live to return a zero/garbage price for crypto symbols.
export const QUOTE_FALLBACK_CANDIDATES: Record<string, string[]> = {
  yahoo: ["finnhub", "polygon"],
  nse_direct: ["yahoo"],
  finnhub: ["twelvedata", "alphavantage", "yahoo"],
  coingecko: ["yahoo"],
};

// Japan/Hong Kong/Europe exchange suffixes — live-tested to have real,
// reliable yahoo coverage, while finnhub/twelvedata/alphavantage are all
// confirmed free-tier-US-only. Routing these straight to yahoo avoids
// burning guaranteed ProviderErrors (plus twelvedata's 8/min budget) per
// symbol before reaching the provider that actually works.
export const JP_HK_EUROPE_SUFFIXES = [
  ".T", ".HK", ".DE", ".PA", ".AS", ".MI", ".MC", ".ST", ".CO", ".HE",
  ".BR", ".LS", ".VI", ".OL", ".SW", ".L",
];

// Cheap local gate before spending a live provider call on a search query —
// deliberately permissive (real tickers/suffixes are short, alnum, at most
// one hyphen segment and one dot-suffix).
const PLAUSIBLE_SYMBOL_RE = /^[A-Z0-9]{1,12}(-[A-Z0-9]{1,10})?(\.[A-Z]{1,4})?$/;

export function looksLikeSymbol(query: string): boolean {
  return PLAUSIBLE_SYMBOL_RE.test(query);
}

/** Port of resolve_quote_provider — single source of truth for "which
 * provider should ingest this symbol's quote". Ordered checks, ported
 * branch-for-branch with the same bug-history comments as the Python source.
 * Unwired this phase — no live call site yet (only the Celery quote-ingestion
 * task calls this in Python); ready for Phase 3 wiring, same as
 * assetCurrency.ts's updateAssetCurrency. */
export function resolveQuoteProvider(symbol: string, assetClass: string | null): string {
  if (assetClass === "crypto_futures") return "binance_price";
  if (assetClass === "crypto" || assetClass === "stablecoin") {
    // Spot crypto/stablecoin — previously fell into the equity default
    // branch below and got routed to finnhub, which returns a zero price
    // for crypto symbols (confirmed live) and wastefully cascaded through
    // the whole equity fallback chain before landing on yahoo.
    return "coingecko";
  }
  if (assetClass === null && symbol.endsWith("-USD")) {
    // asset_class is unknown before an Asset row exists (e.g. a raw search
    // query) — the -USD suffix is the same crypto/stablecoin signal read
    // off the symbol instead of a DB column.
    return "coingecko";
  }
  if (assetClass === "index") {
    // "^"-prefixed tickers (^NSEI, ^GSPC, ...) are Yahoo Finance's own
    // index-ticker convention — Finnhub's free-tier /quote endpoint doesn't
    // recognise this format, so falling through to the finnhub default
    // below would guaranteed-fail every cycle.
    return "yahoo";
  }
  if (symbol.endsWith(".NS")) return "nse_direct";
  if (symbol.endsWith(".BO")) {
    // BSE-only listings: no coverage on nse_direct (NSE-only) or on
    // finnhub/twelvedata/alphavantage (all live-tested US-listed-only on
    // their free tiers) — yahoo remains the only real source.
    return "yahoo";
  }
  if (JP_HK_EUROPE_SUFFIXES.some((suffix) => symbol.endsWith(suffix))) return "yahoo";
  return "finnhub";
}

/** Port of _is_non_us_exchange_symbol — true for symbols resolveQuoteProvider
 * already knows Finnhub can never serve; used to keep Finnhub out of the
 * yahoo fallback chain for these (a real Finnhub attempt is a guaranteed
 * 403, not a genuine fallback). */
export function isNonUsExchangeSymbol(symbol: string): boolean {
  return symbol.endsWith(".NS") || symbol.endsWith(".BO") || JP_HK_EUROPE_SUFFIXES.some((suffix) => symbol.endsWith(suffix));
}

/** Port of _yahoo_can_serve_crypto_symbol — true only for curated-ticker
 * crypto symbols (e.g. BTC-USD) that Yahoo Finance actually recognizes.
 * Non-curated tracked-universe coins are stored under their raw CoinGecko
 * id, which Yahoo 404s on deterministically. */
export function yahooCanServeCryptoSymbol(symbol: string): boolean {
  const raw = symbol.endsWith("-USD") ? symbol.slice(0, -4) : symbol;
  return raw.toUpperCase() in SYMBOL_TO_COINGECKO_ID;
}

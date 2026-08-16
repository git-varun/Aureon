// Port of app/core/binance.py — canonical Binance exchange constants, single
// source of truth for stablecoin identification and quote-asset pairing,
// shared by the Binance broker client/sync (this module tree) and, in
// Python, the CSV/XLSX trade-history importer too (csvImport.ts has its own
// locally-scoped copy of SPOT_TRADE_QUOTES pre-dating this file — not
// consolidated here, out of scope for this change).

// Stablecoins Binance lists as tradable assets. Classified as asset_class=
// "stablecoin" rather than "crypto" — they're not economically volatile, so
// lumping them into "crypto" skews allocation/concentration/risk calculations.
export const STABLECOIN_ASSETS = ["USDT", "USDC", "BUSD", "FDUSD"] as const;

// Non-stablecoin assets Binance also allows as a trading-pair quote asset.
export const CRYPTO_QUOTE_ASSETS = ["BTC", "ETH", "BNB"] as const;

// Full quote-asset list for forming/parsing spot trading pairs, e.g. probing
// "{asset}{quote}" candidates when discovering trade history.
export const SPOT_TRADE_QUOTES: readonly string[] = [...STABLECOIN_ASSETS, ...CRYPTO_QUOTE_ASSETS];

// Internal symbol suffix per futures wallet, e.g. "BTCUSDT" -> "BTCUSDT-USDM".
export const WALLET_SUFFIXES: Record<string, string> = { futures_usdm: "USDM", futures_coinm: "COINM" };

/** Port of split_quote_asset. Strips a known quote asset off the end of a raw
 * Binance pair, e.g. ("BTCUSDT", SPOT_TRADE_QUOTES) -> ["BTC", "USDT"].
 * Returns [null, null] if `pair` doesn't end with any quote asset in `quotes`. */
export function splitQuoteAsset(pair: string, quotes: readonly string[] = SPOT_TRADE_QUOTES): [string | null, string | null] {
  for (const quote of quotes) {
    if (pair.length > quote.length && pair.endsWith(quote)) {
      return [pair.slice(0, pair.length - quote.length), quote];
    }
  }
  return [null, null];
}

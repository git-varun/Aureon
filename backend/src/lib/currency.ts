// Port of app/modules/market/services/market.py infer_currency + _SUFFIX_CURRENCY.
const SUFFIX_CURRENCY: Record<string, string> = {
  ".T": "JPY",
  ".HK": "HKD",
  ".DE": "EUR",
  ".PA": "EUR",
  ".AS": "EUR",
  ".MI": "EUR",
  ".MC": "EUR",
  ".BR": "EUR",
  ".LS": "EUR",
  ".VI": "EUR",
  ".HE": "EUR",
  ".ST": "SEK",
  ".CO": "DKK",
  ".OL": "NOK",
  ".SW": "CHF",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function inferCurrency(
  assetClass: string | null | undefined,
  symbol: string,
  metadata: unknown,
): string {
  if (isPlainObject(metadata) && metadata.currency) {
    return metadata.currency as string;
  }
  if (assetClass === "epf" || assetClass === "nps" || assetClass === "mutual_fund") {
    return "INR";
  }
  if (symbol.endsWith(".NS") || symbol.endsWith(".BO")) {
    return "INR";
  }
  for (const [suffix, currency] of Object.entries(SUFFIX_CURRENCY)) {
    if (symbol.endsWith(suffix)) {
      return currency;
    }
  }
  if (symbol.endsWith(".L")) {
    return "GBP";
  }
  return "USD";
}

// Port of app/modules/market/services/market.py infer_exchange_region.
export function inferExchangeRegion(symbol: string): { exchange: string; region: string } {
  if (symbol.endsWith(".NS")) return { exchange: "NSE", region: "IN" };
  if (symbol.endsWith(".BO")) return { exchange: "BSE", region: "IN" };
  if (symbol.endsWith("-USD") || symbol.endsWith("-USDM") || symbol.endsWith("-COINM")) {
    return { exchange: "CRYPTO", region: "GLOBAL" };
  }
  if (symbol.startsWith("^")) return { exchange: "INDEX", region: "GLOBAL" };
  return { exchange: "NASDAQ", region: "US" };
}

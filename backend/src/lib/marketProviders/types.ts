/** Port of app/core/providers/models.py NormalizedQuote/NormalizedNews. */
export interface NormalizedQuote {
  symbol: string;
  provider: string;
  timestamp: Date;
  price: number;
  volume: number | null;
  // Real per-symbol currency when the provider can resolve one (e.g.
  // yahoo's per-symbol GBp/GBP/USD). null for adapters that don't resolve
  // currency per-quote — inferCurrency() falls back to its suffix heuristic.
  currency: string | null;
}

export interface NormalizedNews {
  provider: string;
  title: string;
  url: string;
  publishedAt: Date;
}

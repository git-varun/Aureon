// Port of app/core/services/config.py's _DEFAULT_PROVIDERS. Only providers
// with a real adapter get ACTIVE/PARTIAL + a non-empty capability list;
// everything else is PLANNED — kept visible in the UI as a roadmap item,
// not deleted or silently presented as if it worked.
export interface DefaultProvider {
  providerName: string;
  providerType: string;
  keyNames: string; // JSON-encoded array, matches the DB column's stored shape
  status: string;
  capabilities: string; // JSON-encoded array
  priority?: number;
  config?: string; // JSON-encoded object, only set for a few "config" providers
}

export const DEFAULT_PROVIDERS: DefaultProvider[] = [
  { providerName: "zerodha", providerType: "broker", keyNames: '["api_key","api_secret","access_token","request_token"]', status: "PARTIAL", capabilities: '["PORTFOLIO","HOLDINGS"]', priority: 10 },
  { providerName: "groww", providerType: "broker", keyNames: '["api_key","api_secret"]', status: "PARTIAL", capabilities: '["PORTFOLIO","HOLDINGS"]', priority: 11 },
  { providerName: "binance", providerType: "broker", keyNames: '["api_key","api_secret"]', status: "PARTIAL", capabilities: '["PORTFOLIO","HOLDINGS","TRANSACTIONS"]', priority: 12 },
  { providerName: "coinbase", providerType: "broker", keyNames: '["api_key","api_secret","api_passphrase"]', status: "PLANNED", capabilities: "[]" },
  { providerName: "custom_equity", providerType: "broker", keyNames: '["holdings_json"]', status: "PLANNED", capabilities: "[]" },
  { providerName: "mf", providerType: "broker", keyNames: '["holdings_json"]', status: "PLANNED", capabilities: "[]" },
  { providerName: "epf", providerType: "broker", keyNames: '["corpus_json"]', status: "PLANNED", capabilities: "[]" },
  { providerName: "nps", providerType: "broker", keyNames: '["corpus_json"]', status: "PLANNED", capabilities: "[]" },
  { providerName: "gemini", providerType: "ai", keyNames: '["api_key"]', status: "ACTIVE", capabilities: '["AI_CHAT"]', priority: 10 },
  { providerName: "groq", providerType: "ai", keyNames: '["api_key"]', status: "ACTIVE", capabilities: '["AI_CHAT"]', priority: 20 },
  { providerName: "rss", providerType: "news", keyNames: "[]", status: "PLANNED", capabilities: "[]" },
  { providerName: "finnhub", providerType: "news", keyNames: '["api_key"]', status: "ACTIVE", capabilities: '["PRICE","NEWS","FUNDAMENTALS"]', priority: 20 },
  { providerName: "polygon", providerType: "price", keyNames: '["api_key"]', status: "ACTIVE", capabilities: '["PRICE","OHLC","CORPORATE_ACTIONS"]', priority: 25 },
  { providerName: "newsapi", providerType: "news", keyNames: '["api_key"]', status: "PLANNED", capabilities: "[]" },
  { providerName: "twelvedata", providerType: "price", keyNames: '["api_key"]', status: "ACTIVE", capabilities: '["PRICE","OHLC","FUNDAMENTALS"]', priority: 21 },
  { providerName: "alphavantage", providerType: "price", keyNames: '["api_key"]', status: "ACTIVE", capabilities: '["PRICE","OHLC","FUNDAMENTALS"]', priority: 22 },
  { providerName: "binance_price", providerType: "price", keyNames: "[]", status: "ACTIVE", capabilities: '["PRICE","OHLC"]', priority: 15 },
  { providerName: "nse_direct", providerType: "price", keyNames: "[]", status: "ACTIVE", capabilities: '["PRICE"]', priority: 5 },
  { providerName: "yahoo", providerType: "price", keyNames: "[]", status: "ACTIVE", capabilities: '["PRICE","NEWS","SEARCH"]', priority: 30 },
  { providerName: "coingecko", providerType: "price", keyNames: "[]", status: "ACTIVE", capabilities: '["PRICE","OHLC","FUNDAMENTALS"]', priority: 16 },
  { providerName: "coinmarketcap", providerType: "price", keyNames: '["api_key"]', status: "PLANNED", capabilities: "[]" },
  { providerName: "mfapi", providerType: "price", keyNames: "[]", status: "ACTIVE", capabilities: '["PRICE"]', priority: 40 },
  { providerName: "telegram", providerType: "notification", keyNames: '["bot_token","chat_id"]', status: "PLANNED", capabilities: "[]" },
  { providerName: "bond_valuation", providerType: "valuation", keyNames: "[]", status: "PLANNED", capabilities: "[]" },
  { providerName: "epf_ppf_valuation", providerType: "valuation", keyNames: "[]", status: "PLANNED", capabilities: "[]" },
  { providerName: "eps_valuation", providerType: "valuation", keyNames: "[]", status: "PLANNED", capabilities: "[]" },
  { providerName: "nps_valuation", providerType: "valuation", keyNames: "[]", status: "PLANNED", capabilities: "[]" },
  { providerName: "insurance_valuation", providerType: "valuation", keyNames: "[]", status: "PLANNED", capabilities: "[]" },
  { providerName: "real_estate_valuation", providerType: "valuation", keyNames: "[]", status: "PLANNED", capabilities: "[]" },
  { providerName: "signal_eligibility", providerType: "config", keyNames: "[]", status: "ACTIVE", capabilities: "[]", config: '{"types":["equity","crypto","commodity"]}' },
  { providerName: "financial_intelligence", providerType: "config", keyNames: "[]", status: "ACTIVE", capabilities: "[]", config: '{"expected_return_default":0.11,"expected_return_high_risk":0.14,"expected_return_low_risk":0.07,"benchmark_annual_return":0.10,"single_stock_concentration_threshold":15.0,"sector_concentration_threshold":30.0,"theme_concentration_threshold":25.0,"diversification_asset_count_threshold":10.0,"diversification_sector_count_threshold":5.0,"diversification_target_score":80.0,"risk_high_crypto_threshold":20.0,"risk_high_equity_threshold":75.0,"risk_low_crypto_threshold":5.0,"risk_low_equity_threshold":35.0}' },
  { providerName: "epf_interest_rates", providerType: "config", keyNames: "[]", status: "ACTIVE", capabilities: "[]", config: '{"rates":{}}' },
];

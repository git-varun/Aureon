// Port of app/modules/market/services/market.py's module-level constants.

// Ticker -> (display name, region) for indices seeded via
// app.workers.ingestion.tasks._INDEX_ASSETS.
export const INDEX_META: Array<{ symbol: string; displayName: string; region: string }> = [
  { symbol: "^NSEI", displayName: "NIFTY 50", region: "IN" },
  { symbol: "^BSESN", displayName: "SENSEX", region: "IN" },
  { symbol: "^NSEBANK", displayName: "BANK NIFTY", region: "IN" },
  { symbol: "^CNXIT", displayName: "NIFTY IT", region: "IN" },
  { symbol: "^GSPC", displayName: "S&P 500", region: "US" },
  { symbol: "^IXIC", displayName: "NASDAQ", region: "US" },
  { symbol: "^FTSE", displayName: "FTSE 100", region: "EU" },
  { symbol: "^N225", displayName: "NIKKEI 225", region: "AS" },
];

// Static symbol -> sector map for the tracked universe (v1: no
// auto-classification for symbols added later; Asset.classification exists
// but is never populated by seeding).
export const SYMBOL_SECTOR_MAP: Record<string, string> = {
  "TCS.NS": "IT", "INFY.NS": "IT", "WIPRO.NS": "IT", "HCLTECH.NS": "IT",
  AAPL: "IT", MSFT: "IT", NVDA: "IT", GOOGL: "IT", META: "IT", AMZN: "IT",
  "HDFCBANK.NS": "Financials", "ICICIBANK.NS": "Financials", "SBIN.NS": "Financials",
  "RELIANCE.NS": "Energy", "ADANIGREEN.NS": "Energy", "TATAPOWER.NS": "Energy", "SUZLON.NS": "Energy",
  "HINDUNILVR.NS": "FMCG", "ITC.NS": "FMCG", "DABUR.NS": "FMCG", "MARICO.NS": "FMCG", "ASIANPAINT.NS": "FMCG",
  TSLA: "Auto",
  "LT.NS": "Capital goods", "BHEL.NS": "Capital goods", "SIEMENS.NS": "Capital goods", "ABB.NS": "Capital goods",
  "BHARTIARTL.NS": "Telecom",
};

export interface SystemTheme {
  id: string;
  name: string;
  desc: string;
  symbols: string[];
  weights: Record<string, number>;
  inception_date: string;
  count: number;
}

export const SYSTEM_THEMES: Record<string, SystemTheme> = {
  "rate-cut": {
    id: "rate-cut",
    name: "Rate-cut beneficiaries",
    desc: "Short-duration treasuries + rate-sensitive financials",
    symbols: ["SGOV", "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS"],
    weights: { SGOV: 0.25, "HDFCBANK.NS": 0.25, "ICICIBANK.NS": 0.25, "SBIN.NS": 0.25 },
    inception_date: "2024-01-01",
    count: 4,
  },
  capex: {
    id: "capex",
    name: "India capex cycle",
    desc: "Infra, capital goods, cement plays",
    symbols: ["LT.NS", "BHEL.NS", "SIEMENS.NS", "ABB.NS"],
    weights: { "LT.NS": 0.25, "BHEL.NS": 0.25, "SIEMENS.NS": 0.25, "ABB.NS": 0.25 },
    inception_date: "2024-01-01",
    count: 4,
  },
  "ai-india": {
    id: "ai-india",
    name: "AI services exposure",
    desc: "Indian IT vendors with AI revenue mix",
    symbols: ["TCS.NS", "INFY.NS", "WIPRO.NS", "HCLTECH.NS"],
    weights: { "TCS.NS": 0.25, "INFY.NS": 0.25, "WIPRO.NS": 0.25, "HCLTECH.NS": 0.25 },
    inception_date: "2024-01-01",
    count: 4,
  },
  "green-energy": {
    id: "green-energy",
    name: "Green energy transition",
    desc: "Solar, EV ecosystem, transmission",
    symbols: ["ADANIGREEN.NS", "TATAPOWER.NS", "SUZLON.NS"],
    weights: { "ADANIGREEN.NS": 0.3333, "TATAPOWER.NS": 0.3333, "SUZLON.NS": 0.3334 },
    inception_date: "2024-01-01",
    count: 3,
  },
  "el-nino": {
    id: "el-nino",
    name: "Monsoon-resilient FMCG",
    desc: "Stable demand through weather variance",
    symbols: ["HINDUNILVR.NS", "ITC.NS", "DABUR.NS", "MARICO.NS"],
    weights: { "HINDUNILVR.NS": 0.25, "ITC.NS": 0.25, "DABUR.NS": 0.25, "MARICO.NS": 0.25 },
    inception_date: "2024-01-01",
    count: 4,
  },
  "small-cap": {
    id: "small-cap",
    name: "Small-cap quality",
    desc: "ROE > 18%, debt-to-equity < 0.5",
    symbols: [],
    weights: {},
    inception_date: "2024-01-01",
    count: 0,
  },
};

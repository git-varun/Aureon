/* ============================================================
   Aureon — India market data + universe for terminal/markets
   ============================================================ */

/* ============================================================
   Currency layer (v4)
   Static FX table for now; getRate() is the seam for live rates.
   getActiveCurrency() reads window.__aureonCurrency so the picker
   in TopBar can flip everything by setting that + re-rendering.
   ============================================================ */
const FX_PER_INR = {
  /* 1 INR = X (target). Static demo rates ~ May 2026. */
  INR: 1,
  USD: 1 / 83.2,
  EUR: 1 / 90.6,
  GBP: 1 / 105.4,
  AED: 1 / 22.65,
  JPY: 1.78,
};
const CURRENCY_META = {
  INR: { code:'INR', symbol:'₹', name:'Indian Rupee',     locale:'en-IN', dp:2 },
  USD: { code:'USD', symbol:'$', name:'US Dollar',         locale:'en-US', dp:2 },
  EUR: { code:'EUR', symbol:'€', name:'Euro',              locale:'en-DE', dp:2 },
  GBP: { code:'GBP', symbol:'£', name:'Pound Sterling',    locale:'en-GB', dp:2 },
  AED: { code:'AED', symbol:'د.إ', name:'UAE Dirham',     locale:'en-AE', dp:2 },
  JPY: { code:'JPY', symbol:'¥', name:'Japanese Yen',     locale:'ja-JP', dp:0 },
};
const SUPPORTED_CURRENCIES = ['INR','USD','EUR','GBP','AED','JPY'];

/* Seam: swap for a live FX endpoint later. (sourceCcy → targetCcy multiplier) */
const getRate = (from, to) => {
  if (from === to) return 1;
  if (!FX_PER_INR[from] || !FX_PER_INR[to]) return 1;
  // amount_INR = amount_from / perINR(from) ; amount_to = amount_INR * perINR(to)
  return FX_PER_INR[to] / FX_PER_INR[from];
};
const getActiveCurrency = () => {
  const c = (typeof window !== 'undefined') && window.__aureonCurrency;
  return SUPPORTED_CURRENCIES.includes(c) ? c : 'INR';
};

/* fmtMoney(amount, sourceCurrency, opts?)
   - converts source → active display currency at presentation layer
   - opts.compact uses lakh/crore for INR, K/M/B for everything else
   - opts.dp overrides decimal places */
const fmtMoney = (n, sourceCcy='INR', opts={}) => {
  if (n == null || !isFinite(n)) return '—';
  const target = opts.target || getActiveCurrency();
  const meta = CURRENCY_META[target] || CURRENCY_META.INR;
  const rate = getRate(sourceCcy, target);
  const converted = n * rate;
  const sign = converted < 0 ? '−' : '';
  const a = Math.abs(converted);
  const dp = opts.dp ?? meta.dp;

  if (opts.compact) {
    if (target === 'INR') {
      if (a >= 1e7) return sign + meta.symbol + (a/1e7).toFixed(2).replace(/\.?0+$/,'') + ' Cr';
      if (a >= 1e5) return sign + meta.symbol + (a/1e5).toFixed(2).replace(/\.?0+$/,'') + ' L';
      if (a >= 1e3) return sign + meta.symbol + (a/1e3).toFixed(1).replace(/\.?0+$/,'') + 'K';
    } else if (target === 'JPY') {
      if (a >= 1e8) return sign + meta.symbol + (a/1e8).toFixed(2) + ' oku';
      if (a >= 1e4) return sign + meta.symbol + (a/1e4).toFixed(1) + ' man';
      if (a >= 1e3) return sign + meta.symbol + (a/1e3).toFixed(1) + 'K';
    } else {
      if (a >= 1e9) return sign + meta.symbol + (a/1e9).toFixed(2) + 'B';
      if (a >= 1e6) return sign + meta.symbol + (a/1e6).toFixed(1) + 'M';
      if (a >= 1e3) return sign + meta.symbol + (a/1e3).toFixed(1) + 'K';
    }
  }
  return sign + meta.symbol + a.toLocaleString(meta.locale, { maximumFractionDigits:dp, minimumFractionDigits:dp });
};

/* Backwards-compatible: existing call sites pass an INR-priced or USD-priced
   value and these treat that value as a source currency. The active display
   currency comes from the window flag. */
const fmtINR = (n, opts={}) => fmtMoney(n, 'INR', opts);
const fmtUSD = (n, opts={}) => fmtMoney(n, 'USD', opts);

const USD_INR = 83.2;

/* Indian universe — equities, MFs, ETFs, schemes, bonds, crypto */
const IN_UNIVERSE = [
  // NSE Equities
  { sym:'RELIANCE', name:'Reliance Industries Ltd',     ex:'NSE', region:'IN', class:'stocks', sector:'Energy',     price:2864.50, dayPct:+0.0064, mcap:'19.4 L Cr' },
  { sym:'TCS',      name:'Tata Consultancy Services',   ex:'NSE', region:'IN', class:'stocks', sector:'IT',         price:3942.20, dayPct:-0.0024, mcap:'14.3 L Cr' },
  { sym:'INFY',     name:'Infosys Ltd',                  ex:'NSE', region:'IN', class:'stocks', sector:'IT',         price:1486.80, dayPct:+0.0118, mcap:'6.18 L Cr' },
  { sym:'HDFCBANK', name:'HDFC Bank Ltd',                ex:'NSE', region:'IN', class:'stocks', sector:'Financials', price:1612.40, dayPct:+0.0042, mcap:'12.2 L Cr' },
  { sym:'ICICIBANK',name:'ICICI Bank Ltd',               ex:'NSE', region:'IN', class:'stocks', sector:'Financials', price:1124.30, dayPct:+0.0091, mcap:'7.92 L Cr' },
  { sym:'BHARTIARTL',name:'Bharti Airtel Ltd',           ex:'NSE', region:'IN', class:'stocks', sector:'Telecom',    price:1378.65, dayPct:+0.0212, mcap:'8.21 L Cr' },
  { sym:'ITC',      name:'ITC Limited',                  ex:'NSE', region:'IN', class:'stocks', sector:'FMCG',       price:432.10,  dayPct:-0.0036, mcap:'5.41 L Cr' },
  { sym:'LT',       name:'Larsen & Toubro',              ex:'NSE', region:'IN', class:'stocks', sector:'Industrials',price:3614.80, dayPct:+0.0083, mcap:'4.97 L Cr' },
  { sym:'SBIN',     name:'State Bank of India',          ex:'NSE', region:'IN', class:'stocks', sector:'Financials', price:842.55,  dayPct:+0.0156, mcap:'7.52 L Cr' },
  { sym:'TATAMOTORS',name:'Tata Motors Ltd',             ex:'NSE', region:'IN', class:'stocks', sector:'Auto',       price:982.40,  dayPct:-0.0212, mcap:'3.66 L Cr' },
  { sym:'HINDUNILVR',name:'Hindustan Unilever',          ex:'NSE', region:'IN', class:'stocks', sector:'FMCG',       price:2412.30, dayPct:-0.0048, mcap:'5.66 L Cr' },
  { sym:'ASIANPAINT',name:'Asian Paints Ltd',            ex:'NSE', region:'IN', class:'stocks', sector:'Materials',  price:2864.10, dayPct:-0.0091, mcap:'2.74 L Cr' },
  // ETFs (Indian)
  { sym:'NIFTYBEES',name:'Nippon India Nifty 50 BeES',   ex:'NSE', region:'IN', class:'funds',  sector:'Index ETF',  price:268.40,  dayPct:+0.0078, mcap:'—' },
  { sym:'BANKBEES', name:'Nippon India Bank BeES',       ex:'NSE', region:'IN', class:'funds',  sector:'Sector ETF', price:512.80,  dayPct:+0.0064, mcap:'—' },
  { sym:'GOLDBEES', name:'Nippon India Gold BeES',       ex:'NSE', region:'IN', class:'funds',  sector:'Commodity',  price:74.20,   dayPct:+0.0042, mcap:'—' },
  // Mutual funds (NAV)
  { sym:'PPFAS-FLEXI',name:'Parag Parikh Flexi Cap',     ex:'MF',  region:'IN', class:'funds',  sector:'Flexi Cap',  price:78.42,   dayPct:+0.0036, mcap:'—' },
  { sym:'AXIS-BLUE',name:'Axis Bluechip Fund',            ex:'MF',  region:'IN', class:'funds',  sector:'Large Cap',  price:64.18,   dayPct:+0.0024, mcap:'—' },
  { sym:'MIRAE-LARGE',name:'Mirae Asset Large Cap',      ex:'MF',  region:'IN', class:'funds',  sector:'Large Cap',  price:96.84,   dayPct:+0.0048, mcap:'—' },
  { sym:'QUANT-SMALL',name:'Quant Small Cap Fund',       ex:'MF',  region:'IN', class:'funds',  sector:'Small Cap',  price:248.40,  dayPct:+0.0118, mcap:'—' },
  // Government schemes (passive)
  { sym:'PPF',      name:'Public Provident Fund',        ex:'GOI', region:'IN', class:'retirement', sector:'PPF · 7.1%', price:1, dayPct:0, mcap:'—' },
  { sym:'EPF',      name:'Employees\u2019 Provident Fund',ex:'GOI', region:'IN', class:'retirement', sector:'EPF · 8.25%', price:1, dayPct:0, mcap:'—' },
  { sym:'NPS-T1',   name:'NPS Tier-1 (Aggressive 75:25)',ex:'GOI', region:'IN', class:'retirement', sector:'NPS',     price:1, dayPct:0, mcap:'—' },
  { sym:'SSY',      name:'Sukanya Samriddhi Yojana',     ex:'GOI', region:'IN', class:'retirement', sector:'SSY · 8.2%', price:1, dayPct:0, mcap:'—' },
  // Bonds
  { sym:'GSEC-10Y', name:'Govt of India 10-yr',          ex:'NDS', region:'IN', class:'bonds',  sector:'Sovereign',  price:99.84,   dayPct:-0.0008, mcap:'—' },
  { sym:'SGB-2031', name:'Sovereign Gold Bond 2031',     ex:'NDS', region:'IN', class:'bonds',  sector:'SGB',        price:7240,    dayPct:+0.0048, mcap:'—' },
  // Crypto INR
  { sym:'BTC-INR',  name:'Bitcoin (INR)',                ex:'BIN', region:'IN', class:'crypto', sector:'Layer 1',    price:5226336, dayPct:-0.0182, mcap:'—' },
  { sym:'ETH-INR',  name:'Ethereum (INR)',               ex:'BIN', region:'IN', class:'crypto', sector:'Layer 1',    price:261414,  dayPct:-0.0234, mcap:'—' },

  // Global (US/EU/Asia) — secondary
  { sym:'NVDA',     name:'NVIDIA Corporation',           ex:'NASDAQ', region:'US', class:'stocks', sector:'Tech',        price:865.42, dayPct:+0.0214, mcap:'$2.13T' },
  { sym:'AAPL',     name:'Apple Inc.',                   ex:'NASDAQ', region:'US', class:'stocks', sector:'Tech',        price:228.74, dayPct:-0.0042, mcap:'$3.48T' },
  { sym:'MSFT',     name:'Microsoft Corp.',              ex:'NASDAQ', region:'US', class:'stocks', sector:'Tech',        price:434.18, dayPct:+0.0118, mcap:'$3.22T' },
  { sym:'GOOGL',    name:'Alphabet Inc. Class A',        ex:'NASDAQ', region:'US', class:'stocks', sector:'Tech',        price:172.86, dayPct:+0.0036, mcap:'$2.14T' },
  { sym:'TSLA',     name:'Tesla Inc.',                   ex:'NASDAQ', region:'US', class:'stocks', sector:'Auto',        price:248.50, dayPct:-0.0212, mcap:'$786B' },
  { sym:'ASML',     name:'ASML Holding NV',              ex:'AMS',    region:'EU', class:'stocks', sector:'Semis',       price:842.10, dayPct:+0.0048, mcap:'€328B' },
  { sym:'LVMH',     name:'LVMH Moët Hennessy',           ex:'PAR',    region:'EU', class:'stocks', sector:'Luxury',      price:712.30, dayPct:-0.0066, mcap:'€356B' },
  { sym:'7203',     name:'Toyota Motor Corp.',           ex:'TYO',    region:'AS', class:'stocks', sector:'Auto',        price:2842,   dayPct:+0.0094, mcap:'¥45.8T' },
  { sym:'9988',     name:'Alibaba Group',                ex:'HKG',    region:'AS', class:'stocks', sector:'Tech',        price:78.40,  dayPct:+0.0124, mcap:'HK$1.6T' },
];

/* Indices: India primary */
const INDICES = [
  { sym:'NIFTY 50',  region:'IN', value:24218.40, dayPct:+0.0064, primary:true },
  { sym:'SENSEX',    region:'IN', value:79842.10, dayPct:+0.0048, primary:true },
  { sym:'BANK NIFTY',region:'IN', value:51842.30, dayPct:+0.0091, primary:true },
  { sym:'NIFTY IT',  region:'IN', value:36284.10, dayPct:+0.0118, primary:false },
  { sym:'NIFTY MIDCAP',region:'IN',value:54218.40,dayPct:+0.0084, primary:false },
  { sym:'S&P 500',   region:'US', value:5284.10,  dayPct:+0.0036 },
  { sym:'NASDAQ',    region:'US', value:16842.10, dayPct:+0.0118 },
  { sym:'FTSE 100',  region:'EU', value:8214.30,  dayPct:-0.0024 },
  { sym:'DAX',       region:'EU', value:18642.10, dayPct:+0.0048 },
  { sym:'NIKKEI 225',region:'AS', value:38842.10, dayPct:+0.0094 },
  { sym:'HANG SENG', region:'AS', value:18412.30, dayPct:+0.0124 },
];

/* Sector heatmap data (NIFTY) */
const NIFTY_SECTORS = [
  { name:'IT',           wt:0.144, dayPct:+0.0118 },
  { name:'Financials',   wt:0.342, dayPct:+0.0064 },
  { name:'Energy',       wt:0.118, dayPct:+0.0042 },
  { name:'FMCG',         wt:0.082, dayPct:-0.0036 },
  { name:'Auto',         wt:0.064, dayPct:-0.0182 },
  { name:'Pharma',       wt:0.058, dayPct:+0.0084 },
  { name:'Metals',       wt:0.038, dayPct:-0.0042 },
  { name:'Realty',       wt:0.022, dayPct:+0.0212 },
  { name:'Telecom',      wt:0.034, dayPct:+0.0212 },
  { name:'Power',        wt:0.028, dayPct:-0.0064 },
  { name:'Capital goods',wt:0.044, dayPct:+0.0148 },
  { name:'Consumer',     wt:0.026, dayPct:+0.0036 },
];

/* Movers */
const TOP_MOVERS = {
  gainers: ['BHARTIARTL','SBIN','INFY','LT','ICICIBANK'],
  losers:  ['TATAMOTORS','ASIANPAINT','HINDUNILVR','ITC','TCS'],
};

/* Discovery themes */
const THEMES = [
  { id:'rate-cut',    name:'Rate-cut beneficiaries', desc:'Long-duration bonds + rate-sensitive sectors', count:14, ret1m:+0.034 },
  { id:'capex',       name:'India capex cycle',      desc:'Infra, capital goods, cement plays',           count:18, ret1m:+0.062 },
  { id:'el-niño',     name:'Monsoon-resilient FMCG', desc:'Stable demand through weather variance',       count:9,  ret1m:+0.018 },
  { id:'ai-india',    name:'AI services exposure',   desc:'Indian IT vendors with AI revenue mix',        count:8,  ret1m:+0.084 },
  { id:'green-energy',name:'Green energy transition',desc:'Solar, EV ecosystem, transmission',            count:12, ret1m:+0.042 },
  { id:'small-cap',   name:'Small-cap quality',      desc:'ROE > 18%, debt-to-equity < 0.5',              count:24, ret1m:+0.028 },
];

/* Watchlist seed */
const SEED_WATCHLIST = ['BHARTIARTL','SBIN','PPFAS-FLEXI','GOLDBEES','NVDA','BTC-INR','LT','QUANT-SMALL'];

/* AI takes for terminal cards (one per asset, brief) */
const TERMINAL_AI = {
  RELIANCE: { strength:'consider',    take:'Energy + retail mix supports earnings; await Jio Financial spinoff cadence.' },
  TCS:      { strength:'hold',        take:'Margin pressure persists; awaiting BFSI deal flow re-acceleration.' },
  INFY:     { strength:'recommended', take:'Revised guidance + AI services traction; momentum constructive.' },
  HDFCBANK: { strength:'consider',    take:'Merger absorption nearing completion; deposit franchise re-rating possible.' },
  BHARTIARTL:{strength:'recommended', take:'ARPU expansion + tariff hike runway; cash flow inflection.' },
  TATAMOTORS:{strength:'conflict',    take:'JLR strength vs domestic CV softness; signals diverging.' },
  NVDA:     { strength:'consider',    take:'Concentration drift; trim suggested in your portfolio (see rec).' },
  BTC:      { strength:'conflict',    take:'Vol regime elevated; trim signal pending allocation review.' },
};

Object.assign(window, {
  fmtINR, fmtUSD, fmtMoney, USD_INR,
  FX_PER_INR, CURRENCY_META, SUPPORTED_CURRENCIES, getRate, getActiveCurrency,
  IN_UNIVERSE, INDICES, NIFTY_SECTORS, TOP_MOVERS, THEMES, SEED_WATCHLIST, TERMINAL_AI,
});

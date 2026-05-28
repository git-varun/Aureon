/* ============================================================
   Aureon — extended seed data for end-to-end app
   ============================================================ */

/* ---------- Holdings: stocks, crypto, funds, bonds, real estate, retirement, insurance ---------- */
const HOLDINGS = [
  // Stocks
  { id:'NVDA',  ticker:'NVDA', name:'NVIDIA Corporation',     class:'stocks',     tier:'active',   qty:120,   cost:412.30,  price:865.42, dayPct:+0.0214, sector:'Tech',         beta:1.74 },
  { id:'AAPL',  ticker:'AAPL', name:'Apple Inc.',             class:'stocks',     tier:'active',   qty:280,   cost:142.10,  price:228.74, dayPct:-0.0042, sector:'Tech',         beta:1.21 },
  { id:'MSFT',  ticker:'MSFT', name:'Microsoft Corp.',        class:'stocks',     tier:'active',   qty:95,    cost:298.50,  price:434.18, dayPct:+0.0118, sector:'Tech',         beta:0.92 },
  { id:'GOOGL', ticker:'GOOGL',name:'Alphabet Inc. Class A',  class:'stocks',     tier:'active',   qty:140,   cost:118.40,  price:172.86, dayPct:+0.0036, sector:'Tech',         beta:1.08 },
  { id:'JNJ',   ticker:'JNJ',  name:'Johnson & Johnson',      class:'stocks',     tier:'active',   qty:60,    cost:158.00,  price:152.43, dayPct:-0.0091, sector:'Healthcare',   beta:0.55 },
  { id:'JPM',   ticker:'JPM',  name:'JPMorgan Chase & Co.',   class:'stocks',     tier:'active',   qty:80,    cost:162.20,  price:198.55, dayPct:+0.0048, sector:'Financials',   beta:1.12 },
  // Crypto
  { id:'BTC',   ticker:'BTC',  name:'Bitcoin',                class:'crypto',     tier:'active',   qty:0.84,  cost:42100,   price:62830,  dayPct:-0.0182, sector:'Layer 1',      beta:2.40 },
  { id:'ETH',   ticker:'ETH',  name:'Ethereum',               class:'crypto',     tier:'active',   qty:7.25,  cost:2480,    price:3142,   dayPct:-0.0234, sector:'Layer 1',      beta:2.05 },
  { id:'SOL',   ticker:'SOL',  name:'Solana',                 class:'crypto',     tier:'active',   qty:42,    cost:118,     price:142.30, dayPct:-0.0312, sector:'Layer 1',      beta:2.85 },
  // Funds
  { id:'VTI',   ticker:'VTI',  name:'Vanguard Total Market',  class:'funds',      tier:'semi',     qty:240,   cost:218.40,  price:268.92, dayPct:+0.0064, sector:'Broad',        beta:1.00 },
  { id:'VXUS',  ticker:'VXUS', name:'Vanguard Intl ex-US',    class:'funds',      tier:'semi',     qty:180,   cost:54.20,   price:62.18,  dayPct:+0.0028, sector:'Intl',         beta:0.88 },
  // Bonds
  { id:'TLT',   ticker:'TLT',  name:'iShares 20+yr Treasury', class:'bonds',      tier:'semi',     qty:160,   cost:108.40,  price:91.24,  dayPct:-0.0042, sector:'Treasury',     beta:0.20 },
  { id:'AGG',   ticker:'AGG',  name:'iShares Core US Bond',   class:'bonds',      tier:'semi',     qty:200,   cost:104.20,  price:97.86,  dayPct:-0.0018, sector:'Aggregate',    beta:0.18 },
  // Real estate (passive)
  { id:'RE-AUS',ticker:'AUSTIN',name:'Austin Duplex',         class:'real_estate',tier:'passive',  qty:1,     cost:485000,  price:612000, dayPct:0,       sector:'Residential',  beta:0 },
  // Retirement (passive)
  { id:'401K',  ticker:'401K', name:'Vanguard 401(k)',        class:'retirement', tier:'passive',  qty:1,     cost:182000,  price:248640, dayPct:0,       sector:'Target 2045',  beta:0 },
  { id:'IRA',   ticker:'IRA',  name:'Roth IRA',               class:'retirement', tier:'passive',  qty:1,     cost:64000,   price:88420,  dayPct:0,       sector:'Self-managed', beta:0 },
  // Insurance (passive)
  { id:'WHOLE', ticker:'WL-A', name:'Whole life · cash value',class:'insurance',  tier:'passive',  qty:1,     cost:24000,   price:31280,  dayPct:0,       sector:'Whole life',   beta:0 },
];

const CLASS_LABEL = {
  stocks:'Stocks', crypto:'Crypto', funds:'Funds', bonds:'Bonds',
  real_estate:'Real estate', retirement:'Retirement', insurance:'Insurance',
};
const CLASS_TARGET = {
  stocks:0.46, crypto:0.07, funds:0.16, bonds:0.10,
  real_estate:0.10, retirement:0.09, insurance:0.02,
};

const valueOf = (h) => h.qty * h.price;
const costOf  = (h) => h.qty * h.cost;
const plOf    = (h) => valueOf(h) - costOf(h);
const plPctOf = (h) => (valueOf(h) - costOf(h)) / costOf(h);

const NET_WORTH = HOLDINGS.reduce((s,h) => s + valueOf(h), 0);
const DAY_DELTA_DOLLARS = 18420;
const DAY_DELTA_PCT = 0.0147;

const allocByClass = () => {
  const map = {};
  HOLDINGS.forEach(h => { map[h.class] = (map[h.class]||0) + valueOf(h); });
  Object.keys(map).forEach(k => map[k] = map[k] / NET_WORTH);
  return map;
};

/* ---------- Signals (raw inputs) ---------- */
const SIGNALS = [
  { id:'sg-001', ts:'14:18', asset:'NVDA', kind:'momentum',    severity:'med', text:'60-day momentum slope turned negative', linkedRec:'r-nvda-trim' },
  { id:'sg-002', ts:'14:11', asset:'NVDA', kind:'sentiment',   severity:'high', text:'Aggregate sentiment dropped 0.4σ in 48h', linkedRec:'r-nvda-hold' },
  { id:'sg-003', ts:'13:54', asset:'BTC',  kind:'volatility',  severity:'high', text:'Realized volatility 14d > 90th percentile', linkedRec:'r-btc-trim' },
  { id:'sg-004', ts:'13:42', asset:'TECH', kind:'allocation',  severity:'high', text:'Tech weight 34.0% vs target 28.0%', linkedRec:'r-tech' },
  { id:'sg-005', ts:'13:20', asset:'ETH',  kind:'sentiment',   severity:'low',  text:'Sentiment recovering toward neutral', linkedRec:null },
  { id:'sg-006', ts:'12:48', asset:'AAPL', kind:'fundamentals',severity:'low',  text:'PEG drifted to 1.8 — above 5y median', linkedRec:null },
  { id:'sg-007', ts:'12:22', asset:'TLT',  kind:'macro',       severity:'med',  text:'10y yield +6bp on stronger PCE print', linkedRec:'r-bonds-add' },
  { id:'sg-008', ts:'11:58', asset:'JNJ',  kind:'news',        severity:'low',  text:'Litigation overhang reduced — sentiment +0.2', linkedRec:null },
  { id:'sg-009', ts:'11:33', asset:'SOL',  kind:'volatility',  severity:'med',  text:'Realized vol diverging from BTC', linkedRec:null },
  { id:'sg-010', ts:'10:48', asset:'PORT', kind:'allocation',  severity:'med',  text:'Bonds 8% vs target 10% — drift accelerating', linkedRec:'r-bonds-add' },
  { id:'sg-011', ts:'09:30', asset:'GOOGL',kind:'fundamentals',severity:'low',  text:'EPS revision +2.1% post-earnings', linkedRec:null },
  { id:'sg-012', ts:'09:14', asset:'MSFT', kind:'momentum',    severity:'low',  text:'50d > 200d crossover persists', linkedRec:null },
  { id:'sg-013', ts:'08:46', asset:'BTC',  kind:'sentiment',   severity:'med',  text:'Funding rates negative across major venues', linkedRec:'r-btc-trim' },
  { id:'sg-014', ts:'08:02', asset:'JPM',  kind:'fundamentals',severity:'low',  text:'Net interest margin guidance reaffirmed', linkedRec:null },
];

/* ---------- Activity ledger (mid-rebalance: 5 applied recently, more queued) ---------- */
const ACTIVITY = [
  { id:'a-101', ts:'today · 09:14', kind:'applied',   action:'Add',       asset:'AGG',  detail:'+$2,400 to bond allocation', predicted:'+0.2pp / 12m', realized:'+0.18pp / 12m' },
  { id:'a-102', ts:'today · 08:46', kind:'applied',   action:'Reduce',    asset:'AAPL', detail:'−$2,800 trim · concentration', predicted:'+0.1pp / 12m', realized:'+0.09pp / 12m' },
  { id:'a-103', ts:'yest · 16:32',  kind:'applied',   action:'Harvest',   asset:'SOL',  detail:'realized −$420 · TLH', predicted:'+$420', realized:'+$420' },
  { id:'a-104', ts:'yest · 14:18',  kind:'dismissed', action:'Add',       asset:'TLT',  detail:'declined — duration concern' },
  { id:'a-105', ts:'2d · 11:08',    kind:'applied',   action:'Rebalance', asset:'PORT', detail:'crypto 9% → 7% · 4 trades', predicted:'+0.3pp / 12m', realized:'+0.31pp / 12m' },
  { id:'a-106', ts:'3d · 10:24',    kind:'applied',   action:'Ladder',    asset:'AGG',  detail:'12mo · 3yr · 5yr rungs built' },
  { id:'a-107', ts:'4d · 15:42',    kind:'dismissed', action:'Reduce',    asset:'JPM',  detail:'declined — earnings catalyst pending' },
  { id:'a-108', ts:'5d · 09:00',    kind:'contribution', action:'Add',    asset:'401K', detail:'$1,250 paycheck contribution' },
  { id:'a-109', ts:'7d · 13:14',    kind:'applied',   action:'Hold',      asset:'NVDA', detail:'momentum diverging — defer' },
];

/* ---------- Extra recs (BTC + bonds) for the Recommendations destination ---------- */
const EXTRA_RECS = [
  {
    id:'r-btc-trim',
    strength:'recommended',
    action:'Reduce',
    scope:{ kind:'asset', ref:'BTC' },
    title:'Trim BTC on volatility spike',
    impactOneLine:'$1,800 cash · risk Δ −0.06β',
    change:{ amount:-1800, percent:-0.06 },
    reasoning:{
      momentum:'Realized vol 14d > 90th percentile',
      sentiment:'Funding rates negative — bearish bias',
      allocation:'Crypto 7.0% vs target 7.0% (within band)',
    },
    confidence:74,
    impact:{
      risk:{ delta:-0.06, unit:'β' },
      ret: { delta:'+0.2pp', horizon:'12m' },
      alloc:{ before:0.070, after:0.064, target:0.070 },
      cash: 1800,
    },
    conflictsWith: [],
    horizon:'Short',
    createdAt:'24 min ago',
  },
  {
    id:'r-bonds-add',
    strength:'consider',
    action:'Add',
    scope:{ kind:'class', ref:'Bonds' },
    title:'Add to bond allocation',
    impactOneLine:'$2,200 deploy · drift 2.0pp closes',
    change:{ amount:2200, percent:+0.025 },
    reasoning:{
      allocation:'Bonds 8% vs target 10%',
      macro:'10y yield +6bp on stronger PCE',
    },
    confidence:65,
    impact:{
      risk:{ delta:-0.04, unit:'β' },
      ret: { delta:'+0.1pp', horizon:'12m' },
      alloc:{ before:0.080, after:0.090, target:0.100 },
      cash: -2200,
    },
    conflictsWith: [],
    horizon:'Long',
    createdAt:'42 min ago',
  },
];

/* ---------- Asset-level price series (for sparkline + chart) ---------- */
const PRICE_SERIES = {
  // 60 daily closes, normalized so the last value matches HOLDINGS price
  NVDA: genSeries('NVDA', 865.42, 60, 0.022, 0.003),
  AAPL: genSeries('AAPL', 228.74, 60, 0.014, -0.001),
  BTC:  genSeries('BTC', 62830, 60, 0.034, -0.002),
  ETH:  genSeries('ETH', 3142, 60, 0.038, -0.003),
};
function genSeries(seed, end, n, vol, drift) {
  const rand = mulberry32(hash(seed));
  const out = new Array(n);
  let v = end;
  // walk backwards so the last point lands on `end`
  for (let i = n-1; i >= 0; i--) {
    out[i] = v;
    const r = (rand() - 0.5) * 2 * vol - drift;
    v = v / (1 + r);
  }
  return out;
}
function hash(s){ let h=2166136261; for(const c of s) h = Math.imul(h^c.charCodeAt(0), 16777619); return h>>>0; }
function mulberry32(a){ return function(){ a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/* ---------- Asset detail extras (fundamentals, peers) ---------- */
const ASSET_EXTRAS = {
  NVDA: { pe:64.2, peg:0.9,  yield:0.00,  mcap:'2.13T',  rev1y:'+126%', signals:['sg-001','sg-002'], rec:'r-nvda-trim' },
  AAPL: { pe:32.4, peg:1.8,  yield:0.0048, mcap:'3.48T', rev1y:'+2%',   signals:['sg-006'],          rec:null },
  BTC:  { pe:null, peg:null, yield:null,  mcap:'1.24T',  rev1y:'+38%',  signals:['sg-003','sg-013'], rec:'r-btc-trim' },
  ETH:  { pe:null, peg:null, yield:null,  mcap:'378B',   rev1y:'+22%',  signals:['sg-005'],          rec:null },
};

const SIGNAL_BY_ID = Object.fromEntries(SIGNALS.map(s => [s.id, s]));

Object.assign(window, {
  HOLDINGS, CLASS_LABEL, CLASS_TARGET,
  valueOf, costOf, plOf, plPctOf,
  NET_WORTH, DAY_DELTA_DOLLARS, DAY_DELTA_PCT,
  allocByClass,
  SIGNALS, SIGNAL_BY_ID, ACTIVITY, EXTRA_RECS,
  PRICE_SERIES, ASSET_EXTRAS,
});

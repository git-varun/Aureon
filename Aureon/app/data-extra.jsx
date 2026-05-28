/* ============================================================
   Aureon — Notifications + Providers + Jobs seed data
   ============================================================ */

const SEED_NOTIFICATIONS = [
  { id:'n-1', read:false, ts:Date.now() - 1000*60*3,    kind:'rec',     title:'New recommendation: Trim NVDA',          msg:'Concentration drift triggered a Reduce signal — confidence 78%.' },
  { id:'n-2', read:false, ts:Date.now() - 1000*60*47,   kind:'signal',  title:'BTC volatility spike',                    msg:'Realized vol crossed 1.8σ over 24h — review crypto allocation.' },
  { id:'n-3', read:false, ts:Date.now() - 1000*60*60*2, kind:'outcome', title:'Applied AGG add realized +0.18pp',        msg:'Outcome confirmed vs predicted +0.20pp · within tolerance.' },
  { id:'n-4', read:true,  ts:Date.now() - 1000*60*60*6, kind:'system',  title:'Zerodha sync complete',                   msg:'12 holdings refreshed, 0 errors.' },
  { id:'n-5', read:true,  ts:Date.now() - 1000*60*60*22,kind:'rec',     title:'Weekly briefing ready',                   msg:'5 active recommendations · 1 conflict pending review.' },
  { id:'n-6', read:true,  ts:Date.now() - 1000*60*60*30,kind:'signal',  title:'Allocation drift: stocks 6pp over target',msg:'Rebalance recommendation queued.' },
  { id:'n-7', read:true,  ts:Date.now() - 1000*60*60*52,kind:'outcome', title:'Trim AAPL applied · realized +0.09pp',    msg:'2-day outcome attributed to concentration reduction.' },
];

const SYNTH_NOTIFICATION_POOL = [
  { kind:'signal',  title:'TCS earnings surprise',           msg:'Revenue beat consensus by 3.2%; sentiment +0.6σ.' },
  { kind:'signal',  title:'Nifty 50 momentum reset',         msg:'Slope inflection detected on 5d window.' },
  { kind:'rec',     title:'New recommendation: Ladder G-Sec',msg:'Yield curve steepened — 3-rung ladder proposed.' },
  { kind:'system',  title:'Groww sync complete',             msg:'Mutual fund NAVs refreshed.' },
  { kind:'system',  title:'Binance prices refreshed',        msg:'Crypto holdings revalued at 14:00 IST.' },
];
let _synthIdx = 0;
const randomNotification = () => {
  const t = SYNTH_NOTIFICATION_POOL[_synthIdx % SYNTH_NOTIFICATION_POOL.length];
  _synthIdx++;
  return { id:'n-syn-'+Date.now(), read:false, ts:Date.now(), ...t };
};

const relTime = (ts) => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24); if (d < 7)  return d + 'd ago';
  return Math.floor(d / 7) + 'w ago';
};

/* ---------- Providers (India-focused, per Aureon ideology) ---------- */
const SEED_PROVIDERS = [
  { id:'zerodha',  name:'Zerodha Kite',     kind:'Broker',     status:'connected',    last:'2m ago',  scope:'Equities · F&O · MF',     keyHint:'••••••MJK4',  user:'VA0421' },
  { id:'groww',    name:'Groww',            kind:'Broker · MF', status:'connected',   last:'14m ago', scope:'Equities · MF · SIPs',    keyHint:'••••••GR91',  user:'vihaan@groww' },
  { id:'binance',  name:'Binance',          kind:'Crypto',     status:'connected',    last:'8m ago',  scope:'Spot · USDT pairs',       keyHint:'••••••BNcZ',  user:'vihaan_a' },
  { id:'icici',    name:'ICICI Direct',     kind:'Broker',     status:'reauth',       last:'3h ago',  scope:'Equities · Bonds',        keyHint:'••••••IC22',  user:'IC0321' },
  { id:'mfcentral',name:'MF Central',       kind:'Aggregator', status:'connected',    last:'1d ago',  scope:'CAS · folios',            keyHint:'CAN-mapped',  user:'PAN-linked' },
  { id:'kuvera',   name:'Kuvera',           kind:'Aggregator', status:'disconnected', last:'never',   scope:'MF · NPS',                keyHint:'—',           user:'—' },
];

/* ---------- Scheduled jobs (Aureon-themed) ---------- */
const SEED_JOBS = [
  { id:'j-pipeline', name:'Decision pipeline',     cron:'every 5m',    enabled:true,  last:'14:18 · ok',     next:'14:23',     desc:'Signals → Interpretation → Recommendations',                logs:['14:18 · 5 signals · 1 new rec','14:13 · 4 signals · 0 new','14:08 · 6 signals · 1 conflict resolved'] },
  { id:'j-prices',   name:'Price refresh',         cron:'every 1m',    enabled:true,  last:'14:22 · ok',     next:'14:23',     desc:'Pulls last close from connected providers',                  logs:['14:22 · 12 holdings updated','14:21 · 12 holdings updated','14:20 · 12 holdings updated'] },
  { id:'j-signals',  name:'Signal generation',     cron:'every 15m',   enabled:true,  last:'14:15 · ok',     next:'14:30',     desc:'Momentum, sentiment, allocation, vol detectors',             logs:['14:15 · 7 signals (2 high)','14:00 · 5 signals (1 high)','13:45 · 4 signals (0 high)'] },
  { id:'j-briefing', name:'AI briefing',           cron:'daily 06:00', enabled:true,  last:'today · 06:00',  next:'tomorrow',  desc:'Overnight portfolio + macro digest',                         logs:['06:00 · briefing delivered (1.2KB)','yesterday · briefing delivered'] },
  { id:'j-drift',    name:'Allocation drift check',cron:'every 1h',    enabled:true,  last:'14:00 · ok',     next:'15:00',     desc:'Compares actuals vs targets; flags >2pp drift',              logs:['14:00 · stocks +6.0pp · rebalance queued','13:00 · stocks +5.8pp','12:00 · stocks +5.6pp'] },
  { id:'j-corp',     name:'Corporate actions',     cron:'daily 18:30', enabled:true,  last:'yest · 18:30',   next:'today 18:30', desc:'Splits, dividends, bonus issues from BSE/NSE',             logs:['18:30 · 0 actions','y-1 · 1 dividend (TCS)'] },
  { id:'j-providers',name:'Provider sync',         cron:'every 30m',   enabled:false, last:'paused 12:00',   next:'—',         desc:'Reconciles holdings across Zerodha · Groww · Binance',       logs:['paused 12:00 · manual disable','11:30 · 4 providers ok'] },
];

Object.assign(window, {
  SEED_NOTIFICATIONS, SYNTH_NOTIFICATION_POOL, randomNotification, relTime,
  SEED_PROVIDERS, SEED_JOBS,
});

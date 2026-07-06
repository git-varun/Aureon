/* Aureon — Transactions ledger (prototype-aligned) */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiService } from '@/api/apiService';
import { usePortfolio } from '@/contexts/PortfolioContext';

/* ── tone maps ──────────────────────────────────────────────────────────── */
const TXN_TYPE_TONE = {
  BUY:      { bg:'rgba(111,174,136,0.14)',  fg:'var(--sage-500)',    dot:'var(--sage-500)' },
  SELL:     { bg:'rgba(209,107,107,0.14)',  fg:'var(--crimson-500)', dot:'var(--crimson-500)' },
  DIVIDEND: { bg:'rgba(201,168,106,0.13)',  fg:'var(--aurum-100)',   dot:'var(--aurum-500)' },
  INTEREST: { bg:'rgba(201,168,106,0.13)',  fg:'var(--aurum-100)',   dot:'var(--aurum-500)' },
  BONUS:    { bg:'rgba(111,174,136,0.14)',  fg:'var(--sage-500)',    dot:'var(--sage-500)' },
  SPLIT:    { bg:'rgba(122,168,212,0.13)',  fg:'#7AA8D4',            dot:'#7AA8D4' },
};
const SRC_TONE = {
  Manual: { bg:'rgba(255,255,255,0.05)', fg:'var(--ink-30)' },
  CSV:    { bg:'rgba(122,168,212,0.10)', fg:'#7AA8D4' },
  CAS:    { bg:'rgba(201,168,106,0.10)', fg:'var(--aurum-300)' },
};
const ALL_TYPES = ['BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'BONUS', 'SPLIT'];
const LCOLS = '88px 76px minmax(160px,1.6fr) 98px 74px 80px 96px 68px 68px minmax(80px,1fr) 70px 56px';
const fldS = { width:'100%', padding:'9px 12px', borderRadius:7, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', color:'var(--ink-10)', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'var(--font-ui)' };
const lblS = { fontSize:10.5, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--ink-30)', fontWeight:600, display:'block', marginBottom:5 };

/* ── helpers ────────────────────────────────────────────────────────────── */
const fmtNum = (n, dp=2) => n == null ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits:dp, maximumFractionDigits:dp });
const fmtMoney = n => n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
const displayType = raw => (raw || '').toUpperCase();
const txnDate = txn => txn.transaction_date ? String(txn.transaction_date).slice(0,10) : '';
const deriveSource = txn => txn.broker_reference ? 'CSV' : 'Manual';
const normKind = kind => kind ? kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase() : '—';

/* ── chips ──────────────────────────────────────────────────────────────── */
const TypeBadge = ({ type }) => {
  const t = TXN_TYPE_TONE[type] || { bg:'rgba(255,255,255,0.05)', fg:'var(--ink-20)', dot:'var(--ink-40)' };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 8px', borderRadius:5, background:t.bg, fontSize:11, fontWeight:600, color:t.fg, letterSpacing:'0.04em', whiteSpace:'nowrap' }}>
      <span style={{ width:4, height:4, borderRadius:999, background:t.dot, flexShrink:0 }}/>
      {type}
    </span>
  );
};

const SourceBadge = ({ source='Manual' }) => {
  const s = SRC_TONE[source] || SRC_TONE.Manual;
  return <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 7px', borderRadius:5, background:s.bg, fontSize:10.5, fontWeight:600, color:s.fg, letterSpacing:'0.06em', whiteSpace:'nowrap' }}>{source}</span>;
};

const ClassChip = ({ cls }) => (
  <span style={{ fontSize:11, color:'var(--ink-30)', background:'rgba(255,255,255,0.04)', padding:'2px 7px', borderRadius:4, border:'1px solid rgba(255,255,255,0.06)', whiteSpace:'nowrap', display:'inline-block' }}>{cls}</span>
);

/* ── skeleton ───────────────────────────────────────────────────────────── */
const Shim = ({ w='100%', h=11, r=4 }) => (
  <div style={{ width:w, height:h, borderRadius:r, background:'rgba(255,255,255,0.045)', animation:'shimmerPulse 1.4s ease-in-out infinite alternate' }}/>
);

function SkeletonRows() {
  return (
    <>
      {[...Array(7)].map((_,i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 18px', borderBottom:'1px solid rgba(255,255,255,0.04)', opacity:Math.max(0.15, 1 - i * 0.12) }}>
          <Shim w={64}/><Shim w={52}/><Shim w={130}/><Shim w={72}/><Shim w={50}/><Shim w={66}/><Shim w={76}/><Shim w={52}/><Shim w={52}/><Shim w={92}/>
        </div>
      ))}
    </>
  );
}

/* ── empty / error states ───────────────────────────────────────────────── */
const LedgerEmpty = ({ isFiltered, onClear, onAdd }) => (
  <div style={{ padding:'52px 32px', textAlign:'center', border:'1px dashed rgba(255,255,255,0.09)', borderRadius:12, background:'rgba(255,255,255,0.012)' }}>
    <div style={{ width:46, height:46, borderRadius:12, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', display:'inline-flex', alignItems:'center', justifyContent:'center', color:'var(--ink-40)', marginBottom:14 }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    </div>
    <div style={{ fontFamily:'var(--font-heading)', fontSize:16, fontWeight:600, color:'var(--ink-00)', marginBottom:7 }}>
      {isFiltered ? 'No matching transactions' : 'No transactions yet'}
    </div>
    <div style={{ fontSize:13, color:'var(--ink-30)', lineHeight:1.55, maxWidth:360, margin:'0 auto 18px' }}>
      {isFiltered ? 'Try broadening your search or adjusting the filters.' : 'Log your first trade manually or import a broker CSV.'}
    </div>
    {isFiltered
      ? <button onClick={onClear} className="du3-cta ghost" style={{ height:34, padding:'0 16px', fontSize:12.5 }}>Clear filters</button>
      : <button onClick={onAdd} className="du3-cta" style={{ height:34, padding:'0 16px', fontSize:12.5, background:'rgba(201,168,106,0.14)', border:'1px solid rgba(201,168,106,0.35)', color:'var(--aurum-100)' }}>Log first transaction</button>
    }
  </div>
);

const SectionError = ({ title, msg, onRetry }) => (
  <div style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'18px 20px', borderRadius:12, background:'rgba(209,107,107,0.06)', border:'1px solid rgba(209,107,107,0.18)' }}>
    <span style={{ width:34, height:34, borderRadius:9, flexShrink:0, background:'rgba(209,107,107,0.12)', color:'var(--crimson-500)', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
    </span>
    <div style={{ flex:1 }}>
      <div style={{ fontSize:14, fontWeight:600, color:'var(--ink-00)', marginBottom:3 }}>{title}</div>
      <div style={{ fontSize:12.5, color:'var(--ink-30)', lineHeight:1.5 }}>{msg}</div>
    </div>
    {onRetry && <button onClick={onRetry} className="du3-cta" style={{ flexShrink:0, height:32, padding:'0 14px', fontSize:12 }}>Retry</button>}
  </div>
);

/* ── filter bar ─────────────────────────────────────────────────────────── */
const TxnSelect = ({ label, value, onChange, options }) => {
  const active = value !== 'All';
  return (
    <div style={{ position:'relative', flexShrink:0 }}>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ height:36, padding:'0 28px 0 10px', borderRadius:7, fontSize:12.5, cursor:'pointer', background:active?'rgba(201,168,106,0.10)':'rgba(255,255,255,0.03)', border:'1px solid '+(active?'rgba(201,168,106,0.30)':'rgba(255,255,255,0.07)'), color:active?'var(--aurum-100)':'var(--ink-20)', appearance:'none', WebkitAppearance:'none', outline:'none', fontFamily:'var(--font-ui)' }}>
        {options.map(o => <option key={o} value={o} style={{ background:'#16181c', color:'#fff' }}>{o === 'All' ? `${label}: All` : o}</option>)}
      </select>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position:'absolute', right:9, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:active?'var(--aurum-100)':'var(--ink-40)' }}><path d="M6 9l6 6 6-6"/></svg>
    </div>
  );
};

function FilterBar({ q, setQ, fDate, setFDate, fClass, setFClass, fType, setFType, classes, dirty, onClear }) {
  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:14 }}>
      <div style={{ position:'relative', flex:'1 1 180px', minWidth:180 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'var(--ink-40)', pointerEvents:'none' }}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search symbol…" style={{ ...fldS, height:36, paddingLeft:32, paddingRight:q?32:12 }}/>
        {q && (
          <button onClick={() => setQ('')} style={{ position:'absolute', right:9, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--ink-40)', display:'inline-flex', padding:2 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:7, padding:'0 10px', height:36, flexShrink:0 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color:'var(--ink-40)', flexShrink:0 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <input type="date" value={fDate.from} onChange={e => setFDate(d => ({...d, from:e.target.value}))} style={{ background:'transparent', border:'none', color:fDate.from?'var(--ink-10)':'var(--ink-40)', fontSize:12, outline:'none', colorScheme:'dark', width:105, cursor:'pointer', fontFamily:'var(--font-mono)' }}/>
        <span style={{ color:'var(--ink-50)', fontSize:11, flexShrink:0 }}>–</span>
        <input type="date" value={fDate.to} onChange={e => setFDate(d => ({...d, to:e.target.value}))} style={{ background:'transparent', border:'none', color:fDate.to?'var(--ink-10)':'var(--ink-40)', fontSize:12, outline:'none', colorScheme:'dark', width:105, cursor:'pointer', fontFamily:'var(--font-mono)' }}/>
      </div>
      <TxnSelect label="Class" value={fClass} onChange={setFClass} options={['All', ...classes]}/>
      <TxnSelect label="Type"  value={fType}  onChange={setFType}  options={['All', ...ALL_TYPES]}/>
      {dirty && <button onClick={onClear} className="du3-cta ghost" style={{ height:36, padding:'0 12px', fontSize:12, color:'var(--aurum-300)', flexShrink:0 }}>Clear</button>}
    </div>
  );
}

/* ── ledger table ───────────────────────────────────────────────────────── */
const LedgerHead = () => (
  <div style={{ display:'grid', gridTemplateColumns:LCOLS, gap:8, padding:'10px 18px', fontSize:10, letterSpacing:'0.13em', textTransform:'uppercase', color:'var(--ink-40)', fontWeight:700, borderBottom:'1px solid rgba(255,255,255,0.07)', minWidth:1020, userSelect:'none' }}>
    <div>Trade</div><div>Sett.</div><div>Symbol</div><div>Class</div><div>Dir</div>
    <div style={{textAlign:'right'}}>Qty</div><div style={{textAlign:'right'}}>Avg Price</div>
    <div style={{textAlign:'right'}}>Fees</div><div style={{textAlign:'right'}}>Taxes</div>
    <div>Notes</div><div>Source</div><div/>
  </div>
);

function LedgerRow({ txn, onEdit, onDelete }) {
  const [hov, setHov] = useState(false);
  const type   = displayType(txn.transaction_type);
  const date   = txnDate(txn);
  const source = deriveSource(txn);
  const kind   = normKind(txn.kind);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display:'grid', gridTemplateColumns:LCOLS, gap:8, padding:'11px 18px', borderBottom:'1px solid rgba(255,255,255,0.04)', alignItems:'center', minWidth:1020, background:hov?'rgba(255,255,255,0.018)':'transparent', transition:'background 80ms' }}
    >
      <span style={{ fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--ink-30)' }}>{date.slice(5) || '—'}</span>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-50)' }}>—</span>
      <div style={{ display:'flex', flexDirection:'column', gap:1, minWidth:0, overflow:'hidden' }}>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:12.5, fontWeight:600, color:'var(--ink-00)', letterSpacing:'0.03em' }}>{txn.symbol}</span>
        {txn.broker && <span style={{ fontSize:11, color:'var(--ink-40)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', textTransform:'capitalize' }}>{txn.broker}</span>}
      </div>
      <ClassChip cls={kind}/>
      <TypeBadge type={type}/>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--ink-20)', textAlign:'right' }}>
        {txn.quantity != null ? fmtNum(txn.quantity, txn.quantity >= 1 ? 0 : 4) : '—'}
      </span>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--ink-20)', textAlign:'right' }}>
        {txn.price != null ? fmtMoney(txn.price) : '—'}
      </span>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:11.5, textAlign:'right', color:(txn.fees||0)>0?'var(--crimson-500)':'var(--ink-60,#3a3e46)' }}>
        {(txn.fees||0)>0 ? fmtMoney(txn.fees) : '—'}
      </span>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:11.5, textAlign:'right', color:(txn.taxes||0)>0?'var(--crimson-500)':'var(--ink-60,#3a3e46)' }}>
        {(txn.taxes||0)>0 ? fmtMoney(txn.taxes) : '—'}
      </span>
      <span style={{ fontSize:11.5, color:'var(--ink-40)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={txn.notes||''}>{txn.notes || '—'}</span>
      <SourceBadge source={source}/>
      <div style={{ display:'flex', gap:3, justifyContent:'flex-end', opacity:hov?1:0, transition:'opacity 80ms' }}>
        <button onClick={() => onEdit(txn)} title="Edit transaction" style={{ width:26, height:26, borderRadius:6, display:'inline-flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', cursor:'pointer', color:'var(--ink-30)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button onClick={() => onDelete(txn)} title="Delete transaction" style={{ width:26, height:26, borderRadius:6, display:'inline-flex', alignItems:'center', justifyContent:'center', background:'rgba(209,107,107,0.10)', border:'1px solid rgba(209,107,107,0.20)', cursor:'pointer', color:'var(--crimson-500)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>
  );
}

/* ── delete confirm dialog ──────────────────────────────────────────────── */
function DeleteConfirmDialog({ txn, deleting, onCancel, onConfirm }) {
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape' && !deleting) onCancel(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onCancel, deleting]);

  const type = displayType(txn.transaction_type);
  const date = txnDate(txn);

  return (
    <div onClick={() => { if (!deleting) onCancel(); }} style={{ position:'fixed', inset:0, zIndex:1100, background:'rgba(6,8,11,0.65)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width:'min(440px,94vw)', borderRadius:16, overflow:'hidden', background:'rgba(13,15,19,0.98)', border:'1px solid rgba(255,255,255,0.10)', boxShadow:'0 32px 80px rgba(0,0,0,0.60)', backdropFilter:'blur(40px)' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:13, padding:'20px 22px 14px' }}>
          <span style={{ width:36, height:36, borderRadius:10, flexShrink:0, background:'rgba(209,107,107,0.14)', color:'var(--crimson-500)', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
          </span>
          <div style={{ flex:1, paddingTop:1 }}>
            <div style={{ fontFamily:'var(--font-heading)', fontSize:16, fontWeight:600, color:'var(--ink-00)' }}>Delete this transaction?</div>
            <div style={{ fontSize:13, color:'var(--ink-30)', marginTop:5, lineHeight:1.55 }}>
              Removing it will recalculate <strong style={{color:'var(--ink-10)',fontWeight:600}}>{txn.symbol}</strong>'s cost basis and P&amp;L. This can't be undone.
            </div>
          </div>
        </div>
        <div style={{ margin:'0 22px', padding:'11px 14px', borderRadius:10, background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:13, fontWeight:600, color:'var(--ink-00)' }}>{type} · {txn.symbol}</div>
            <div style={{ fontSize:11, color:'var(--ink-40)', marginTop:2 }}>{date}{txn.broker ? ` · ${txn.broker}` : ''}</div>
          </div>
          <TypeBadge type={type}/>
        </div>
        <div style={{ display:'flex', gap:10, padding:'16px 22px 20px' }}>
          <button onClick={onCancel} disabled={deleting} className="du3-cta ghost" style={{ flex:1, height:40 }}>Cancel</button>
          <button onClick={onConfirm} disabled={deleting} className="du3-cta" style={{ flex:1, height:40, background:'rgba(209,107,107,0.16)', border:'1px solid rgba(209,107,107,0.38)', color:'var(--crimson-500)' }}>
            {deleting ? 'Deleting…' : 'Delete transaction'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── drawer field helpers (module-level to avoid recreate-on-render) ───── */
const FieldLabel = ({ label, children }) => (
  <div><label style={lblS}>{label}</label>{children}</div>
);

const NumField = ({ value, onChange, ph, pre }) => (
  <div style={{ position:'relative' }}>
    {pre && <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'var(--ink-30)', fontFamily:'var(--font-mono)', pointerEvents:'none' }}>{pre}</span>}
    <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder={ph} style={{ ...fldS, fontFamily:'var(--font-mono)', paddingLeft: pre ? 24 : 12 }}/>
  </div>
);

const SegControl = ({ value, onChange, opts }) => (
  <div style={{ display:'flex', gap:4, padding:3, borderRadius:8, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
    {opts.map(([v, l, bg, fg]) => (
      <button key={v} onClick={() => onChange(v)} style={{ flex:1, padding:'7px 4px', fontSize:11.5, borderRadius:5, border:'none', cursor:'pointer', fontFamily:'var(--font-ui)', background: value===v ? (bg||'rgba(201,168,106,0.14)') : 'transparent', color: value===v ? (fg||'var(--aurum-100)') : 'var(--ink-30)', fontWeight: value===v ? 600 : 400 }}>
        {l}
      </button>
    ))}
  </div>
);

/* ── transaction drawer ─────────────────────────────────────────────────── */
function TransactionDrawer({ mode, txn, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [tab, setTab] = useState(() => {
    if (!isEdit) return 'trade';
    const k = (txn?.kind || '').toLowerCase();
    if (k === 'nps') return 'nps';
    if (k === 'epf') return 'epf';
    return 'trade';
  });
  const dflt = { symbol:'', type:'BUY', qty:'', price:'', date:new Date().toISOString().slice(0,10), settlementDate:'', fees:'', taxes:'', notes:'', broker:'zerodha' };
  const [form, setForm] = useState(() =>
    isEdit ? {
      ...dflt,
      symbol: txn?.symbol || '',
      type:   displayType(txn?.transaction_type || 'BUY'),
      qty:    txn?.quantity != null ? String(txn.quantity) : '',
      price:  txn?.price != null ? String(txn.price) : '',
      date:   txnDate(txn) || dflt.date,
      fees:   txn?.fees != null ? String(txn.fees) : '',
      taxes:  txn?.taxes != null ? String(txn.taxes) : '',
      notes:  txn?.notes || '',
      broker: txn?.broker || 'zerodha',
    } : dflt
  );
  const [query, setQuery] = useState(() => isEdit ? (txn?.symbol || '') : '');
  const [results, setResults] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const set = (k, v) => setForm(f => ({...f, [k]:v}));

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  useEffect(() => {
    if (isEdit || !query.trim()) return;
    const tid = setTimeout(async () => {
      try {
        const res = await apiService.searchAssets(query);
        setResults((res.data || []).slice(0, 8));
      } catch { setResults([]); }
    }, 250);
    return () => clearTimeout(tid);
  }, [query, isEdit]);

  const visibleResults = (!isEdit && query.trim()) ? results : [];

  const pick = asset => { set('symbol', asset.sym); setQuery(asset.sym); setResults([]); };


  const valid = tab === 'trade' || isEdit
    ? (form.symbol && form.qty && form.price)
    : tab === 'nps'
      ? (form.symbol && form.price)
      : form.date;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      let payload;
      if (tab === 'nps' && !isEdit) {
        payload = { symbol: form.symbol || 'NPS-T1', transaction_type:'buy', quantity: parseFloat(form.qty)||1, price: parseFloat(form.price)||0, transaction_date: form.date, fees:0, taxes:0, notes: form.notes||undefined, broker:'NPS Trust' };
      } else if (tab === 'epf' && !isEdit) {
        const emp = parseFloat(form.qty)||0;
        const er  = parseFloat(form.price)||0;
        payload = { symbol:'EPF', transaction_type:'buy', quantity:1, price: emp + er, transaction_date: form.date, fees:0, taxes:0, notes: `Employee: ₹${emp} | Employer: ₹${er}` + (form.fees?` | EPS: ₹${form.fees}`:''), broker:'EPFO' };
      } else {
        payload = {
          symbol:           form.symbol.toUpperCase(),
          transaction_type: form.type.toLowerCase(),
          quantity:         parseFloat(form.qty),
          price:            parseFloat(form.price),
          transaction_date: form.date,
          fees:             parseFloat(form.fees)||0,
          taxes:            parseFloat(form.taxes)||0,
          notes:            form.notes || undefined,
          broker:           form.broker || undefined,
        };
      }
      if (isEdit) {
        await apiService.updateTransaction(null, txn.id, payload);
        toast.success(`${payload.symbol} updated`);
      } else {
        await apiService.createTransaction(null, payload);
        toast.success(`${(payload.symbol||'').toUpperCase()} ${payload.transaction_type.toUpperCase()} logged`);
      }
      onSaved();
    } catch (e) {
      toast.error(e?.message || 'Failed to save transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const grossVal = (parseFloat(form.qty)||0) * (parseFloat(form.price)||0);

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:900, background:'rgba(6,8,11,0.5)', backdropFilter:'blur(4px)' }}/>
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:'min(520px,95vw)', zIndex:901, display:'flex', flexDirection:'column', background:'rgba(11,13,17,0.99)', borderLeft:'1px solid rgba(255,255,255,0.09)', boxShadow:'-20px 0 64px rgba(0,0,0,0.55)' }}>
        {/* header */}
        <div style={{ padding:'20px 24px 0', borderBottom:'1px solid rgba(255,255,255,0.07)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', paddingBottom:16 }}>
            <div>
              <div style={{ fontFamily:'var(--font-heading)', fontSize:17, fontWeight:600, color:'var(--ink-00)' }}>{isEdit ? 'Edit transaction' : 'New transaction'}</div>
              <div style={{ fontSize:12, color:'var(--ink-40)', marginTop:3 }}>{isEdit ? `${txn.symbol} · ${displayType(txn.transaction_type)} · ${txnDate(txn)}` : 'Record a trade or contribution'}</div>
            </div>
            <button onClick={onClose} style={{ width:30, height:30, borderRadius:8, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', cursor:'pointer', color:'var(--ink-30)', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginLeft:12 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          {!isEdit && (
            <div style={{ display:'flex', gap:0 }}>
              {[['trade','Trade'],['nps','NPS'],['epf','EPF']].map(([id, lbl]) => (
                <button key={id} onClick={() => setTab(id)} style={{ padding:'9px 16px', background:'none', border:'none', cursor:'pointer', fontSize:13, fontFamily:'var(--font-ui)', color: tab===id?'var(--ink-00)':'var(--ink-40)', fontWeight: tab===id?600:400, borderBottom:'2px solid '+(tab===id?'var(--aurum-500)':'transparent'), marginBottom:-1 }}>
                  {lbl}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* body */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
          {(tab === 'trade' || isEdit) && (
            <>
              <FieldLabel label="Ticker / symbol">
                <div style={{ position:'relative' }}>
                  <input value={query} onChange={e => { setQuery(e.target.value); set('symbol', e.target.value.toUpperCase()); }} placeholder="e.g. RELIANCE, NVDA, BTC" style={fldS} autoFocus={!isEdit}/>
                  {visibleResults.length > 0 && (
                    <div style={{ position:'absolute', left:0, right:0, top:'calc(100% + 4px)', zIndex:20, background:'rgba(16,18,22,0.98)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:9, overflow:'hidden', boxShadow:'0 10px 36px rgba(0,0,0,0.45)', maxHeight:210, overflowY:'auto' }}>
                      {visibleResults.map(u => (
                        <button key={u.sym} onClick={() => pick(u)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 12px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left' }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--ink-00)', fontWeight:600, minWidth:84 }}>{u.sym}</span>
                          <span style={{ fontSize:12, color:'var(--ink-30)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </FieldLabel>
              <FieldLabel label="Direction">
                <SegControl value={form.type} onChange={v => set('type', v)} opts={[
                  ['BUY',      'Buy',      'rgba(111,174,136,0.16)',  'var(--sage-500)'],
                  ['SELL',     'Sell',     'rgba(209,107,107,0.16)',  'var(--crimson-500)'],
                  ['DIVIDEND', 'Div',      'rgba(201,168,106,0.14)',  'var(--aurum-100)'],
                  ['SPLIT',    'Split',    'rgba(122,168,212,0.14)',  '#7AA8D4'],
                  ['BONUS',    'Bonus',    'rgba(111,174,136,0.16)',  'var(--sage-500)'],
                  ['INTEREST', 'Interest', 'rgba(201,168,106,0.14)',  'var(--aurum-100)'],
                ]}/>
              </FieldLabel>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <FieldLabel label="Quantity"><NumField value={form.qty} onChange={v => set('qty', v)} ph="0.00"/></FieldLabel>
                <FieldLabel label="Price / unit"><NumField value={form.price} onChange={v => set('price', v)} ph="0.00" pre="₹"/></FieldLabel>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <FieldLabel label="Trade date"><input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={{ ...fldS, colorScheme:'dark' }}/></FieldLabel>
                <FieldLabel label="Settlement date"><input type="date" value={form.settlementDate} onChange={e => set('settlementDate', e.target.value)} style={{ ...fldS, colorScheme:'dark' }}/></FieldLabel>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <FieldLabel label="Fees"><NumField value={form.fees} onChange={v => set('fees', v)} ph="0.00" pre="₹"/></FieldLabel>
                <FieldLabel label="Taxes (STT / TDS)"><NumField value={form.taxes} onChange={v => set('taxes', v)} ph="0.00" pre="₹"/></FieldLabel>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <FieldLabel label="Broker / venue">
                  <select value={form.broker} onChange={e => set('broker', e.target.value)} style={{ ...fldS, cursor:'pointer' }}>
                    {['zerodha','groww','binance','ibkr','manual'].map(b => (
                      <option key={b} value={b} style={{ background:'#16181c' }}>{b.charAt(0).toUpperCase()+b.slice(1)}</option>
                    ))}
                  </select>
                </FieldLabel>
              </div>
              <FieldLabel label="Notes (optional)">
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. rebalancing, year-end harvest, conviction buy…" rows={2} style={{ ...fldS, resize:'vertical', minHeight:56, lineHeight:1.5 }}/>
              </FieldLabel>
              {grossVal > 0 && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 14px', borderRadius:9, background:'rgba(201,168,106,0.06)', border:'1px solid rgba(201,168,106,0.16)' }}>
                  <span style={{ fontSize:12, color:'var(--ink-30)' }}>Gross value</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:15, fontWeight:500, color:'var(--ink-00)' }}>₹{grossVal.toLocaleString('en-IN', {maximumFractionDigits:2})}</span>
                </div>
              )}
            </>
          )}

          {tab === 'nps' && !isEdit && (
            <>
              <FieldLabel label="Account tier">
                <SegControl value={form.symbol} onChange={v => set('symbol', v)} opts={[['NPS-T1','Tier I · retirement'],['NPS-T2','Tier II · flexible']]}/>
              </FieldLabel>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <FieldLabel label="Contribution date"><input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={{ ...fldS, colorScheme:'dark' }}/></FieldLabel>
                <FieldLabel label="Contribution amount"><NumField value={form.price} onChange={v => set('price', v)} ph="0" pre="₹"/></FieldLabel>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <FieldLabel label="NAV / unit (optional)"><NumField value={form.qty} onChange={v => set('qty', v)} ph="0.000"/></FieldLabel>
                <FieldLabel label="Units allocated (optional)"><NumField value={form.fees} onChange={v => set('fees', v)} ph="0.000"/></FieldLabel>
              </div>
            </>
          )}

          {tab === 'epf' && !isEdit && (
            <>
              <FieldLabel label="Contribution month"><input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={{ ...fldS, colorScheme:'dark' }}/></FieldLabel>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <FieldLabel label="Employee share"><NumField value={form.qty} onChange={v => set('qty', v)} ph="0" pre="₹"/></FieldLabel>
                <FieldLabel label="Employer share"><NumField value={form.price} onChange={v => set('price', v)} ph="0" pre="₹"/></FieldLabel>
              </div>
              <FieldLabel label="EPS share (optional)"><NumField value={form.fees} onChange={v => set('fees', v)} ph="0" pre="₹"/></FieldLabel>
            </>
          )}
        </div>

        {/* footer */}
        <div style={{ padding:'14px 24px 20px', borderTop:'1px solid rgba(255,255,255,0.07)', display:'flex', gap:10, flexShrink:0 }}>
          <button onClick={onClose} className="du3-cta ghost" style={{ flex:1, height:40 }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!valid || submitting} className="du3-cta" style={{ flex:2, height:40, background:'rgba(201,168,106,0.14)', border:'1px solid rgba(201,168,106,0.35)', color:'var(--aurum-100)', opacity:(!valid||submitting)?0.45:1 }}>
            {submitting ? 'Saving…' : (isEdit ? 'Save changes' : 'Log transaction')}
          </button>
        </div>
      </div>
    </>
  );
}

/* ── pending imports (no backend endpoint yet) ──────────────────────────── */
const PendingImportsEmpty = () => (
  <div style={{ padding:'52px 32px', textAlign:'center', border:'1px dashed rgba(255,255,255,0.09)', borderRadius:12, background:'rgba(255,255,255,0.012)' }}>
    <div style={{ width:46, height:46, borderRadius:12, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', display:'inline-flex', alignItems:'center', justifyContent:'center', color:'var(--ink-40)', marginBottom:14 }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    </div>
    <div style={{ fontFamily:'var(--font-heading)', fontSize:16, fontWeight:600, color:'var(--ink-00)', marginBottom:7 }}>No pending imports</div>
    <div style={{ fontSize:13, color:'var(--ink-30)', lineHeight:1.55 }}>All imported transactions have been reviewed. Import a new CSV or CAS statement to continue.</div>
  </div>
);

/* ── import history (no backend endpoint yet) ───────────────────────────── */
const ImportHistoryEmpty = () => (
  <div style={{ padding:'44px 32px', textAlign:'center', border:'1px dashed rgba(255,255,255,0.09)', borderRadius:12, background:'rgba(255,255,255,0.012)' }}>
    <div style={{ fontFamily:'var(--font-heading)', fontSize:15, fontWeight:600, color:'var(--ink-00)', marginBottom:7 }}>No import history yet</div>
    <div style={{ fontSize:13, color:'var(--ink-30)' }}>Import a broker CSV or CAS statement to populate this list.</div>
  </div>
);

/* ── stat bar ───────────────────────────────────────────────────────────── */
const StatEyebrow = ({ children }) => (
  <div style={{ fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--ink-40)', fontWeight:700 }}>{children}</div>
);

function StatBar({ filtered, total, loaded }) {
  const buys       = loaded ? filtered.filter(t => displayType(t.transaction_type) === 'BUY').length : null;
  const sells      = loaded ? filtered.filter(t => displayType(t.transaction_type) === 'SELL').length : null;
  const totalFees  = loaded ? filtered.reduce((s, t) => s + (t.fees||0), 0) : null;
  const totalTaxes = loaded ? filtered.reduce((s, t) => s + (t.taxes||0), 0) : null;
  const count      = loaded ? filtered.length : null;

  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:28, paddingBottom:16, borderBottom:'1px solid rgba(255,255,255,0.05)', marginBottom:16, flexWrap:'wrap' }}>
      <div>
        <StatEyebrow>Confirmed</StatEyebrow>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:34, fontWeight:500, color:'var(--ink-00)', marginTop:5, lineHeight:1 }}>
          {count != null ? count : <span style={{color:'var(--ink-50)'}}>—</span>}
        </div>
        <div style={{ fontSize:11, color:'var(--ink-40)', marginTop:3 }}>
          transactions{loaded && count !== total ? ` of ${total}` : ''}
        </div>
      </div>
      <div>
        <StatEyebrow>Buys</StatEyebrow>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:22, color:'var(--sage-500)', marginTop:5 }}>{buys ?? '—'}</div>
      </div>
      <div>
        <StatEyebrow>Sells</StatEyebrow>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:22, color:'var(--crimson-500)', marginTop:5 }}>{sells ?? '—'}</div>
      </div>
      <div>
        <StatEyebrow>Fees paid</StatEyebrow>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:22, color: totalFees!=null&&totalFees>0?'var(--crimson-500)':'var(--ink-50)', marginTop:5 }}>
          {totalFees != null ? (totalFees > 0 ? fmtMoney(totalFees) : '—') : '—'}
        </div>
      </div>
      <div>
        <StatEyebrow>Taxes paid</StatEyebrow>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:22, color: totalTaxes!=null&&totalTaxes>0?'var(--crimson-500)':'var(--ink-50)', marginTop:5 }}>
          {totalTaxes != null ? (totalTaxes > 0 ? fmtMoney(totalTaxes) : '—') : '—'}
        </div>
      </div>
      <div style={{ flex:1 }}/>
    </div>
  );
}

/* ── transactions ledger ────────────────────────────────────────────────── */
function TransactionsLedger({ txns, isLoading, isError, refetch, onAdd, onMutated }) {
  const qc = useQueryClient();
  const [q, setQ]           = useState('');
  const [fDate, setFDate]   = useState({ from:'', to:'' });
  const [fClass, setFClass] = useState('All');
  const [fType, setFType]   = useState('All');
  const [drawer, setDrawer] = useState(null);  // null | 'create' | txnObj
  const [confirm, setConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(25);
  const [prevFilterSig, setPrevFilterSig] = useState('');
  const filterSig = `${q}|${fDate.from}|${fDate.to}|${fClass}|${fType}`;
  if (prevFilterSig !== filterSig) {
    setPrevFilterSig(filterSig);
    setVisibleCount(25);
  }

  const classes = useMemo(() => {
    const s = new Set(txns.map(t => normKind(t.kind)).filter(k => k && k !== '—'));
    return [...s].sort();
  }, [txns]);

  const dirty = !!(q || fDate.from || fDate.to || fClass !== 'All' || fType !== 'All');
  const clearFilters = useCallback(() => { setQ(''); setFDate({from:'',to:''}); setFClass('All'); setFType('All'); }, []);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return txns.filter(t => {
      if (fClass !== 'All' && normKind(t.kind) !== fClass) return false;
      if (fType !== 'All' && displayType(t.transaction_type) !== fType) return false;
      const date = txnDate(t);
      if (fDate.from && date < fDate.from) return false;
      if (fDate.to   && date > fDate.to)   return false;
      if (ql && !(t.symbol||'').toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [txns, q, fDate, fClass, fType]);

  const handleDelete = async () => {
    if (!confirm || deleting) return;
    setDeleting(true);
    try {
      await apiService.deleteTransaction(null, confirm.id);
      toast.success(`${displayType(confirm.transaction_type)} ${confirm.symbol} deleted`);
      onMutated?.();
      setConfirm(null);
    } catch (e) {
      toast.error(e?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const handleSaved = useCallback(() => {
    onMutated?.();
    setDrawer(null);
  }, [onMutated]);

  return (
    <>
      <StatBar filtered={filtered} total={txns.length} loaded={!isLoading && !isError}/>
      <FilterBar q={q} setQ={setQ} fDate={fDate} setFDate={setFDate} fClass={fClass} setFClass={setFClass} fType={fType} setFType={setFType} classes={classes} dirty={dirty} onClear={clearFilters}/>

      <div className="layer-1" style={{ padding:0, overflow:'hidden' }}>
        <LedgerHead/>
        <div style={{ overflowX:'auto' }}>
          {isLoading && <SkeletonRows/>}
          {isError && (
            <div style={{padding:20}}>
              <SectionError title="Failed to load transactions" msg="Couldn't reach the ledger. Check your connection and try again." onRetry={refetch}/>
            </div>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <div style={{padding:20}}>
              <LedgerEmpty isFiltered={dirty} onClear={clearFilters} onAdd={onAdd}/>
            </div>
          )}
          {!isLoading && !isError && filtered.slice(0, visibleCount).map(t => (
            <LedgerRow key={t.id} txn={t} onEdit={t => setDrawer(t)} onDelete={t => setConfirm(t)}/>
          ))}
        </div>
      </div>

      {!isLoading && !isError && filtered.length > visibleCount && (
        <div style={{ display:'flex', justifyContent:'center', marginTop:16 }}>
          <button onClick={() => setVisibleCount(c => c + 25)} className="du3-cta ghost" style={{ height:36, padding:'0 24px', fontSize:12.5 }}>
            Load more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div style={{ fontSize:11, color:'var(--ink-50)', marginTop:10, display:'flex', alignItems:'center', gap:6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          Transactions logs executed trades &amp; contributions. Deleting recalculates the linked position.
        </div>
      )}

      {confirm && (
        <DeleteConfirmDialog
          txn={confirm}
          deleting={deleting}
          onCancel={() => { if (!deleting) setConfirm(null); }}
          onConfirm={handleDelete}
        />
      )}
      {drawer && (
        <TransactionDrawer
          mode={drawer === 'create' ? 'create' : 'edit'}
          txn={drawer === 'create' ? null : drawer}
          onClose={() => setDrawer(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

/* ── page shell ─────────────────────────────────────────────────────────── */
const SUB_TABS = [
  { id:'confirmed', label:'Confirmed' },
  { id:'pending',   label:'Pending imports' },
  { id:'history',   label:'Import history' },
];

export default function Transactions() {
  const qc = useQueryClient();
  const { activePortfolioId } = usePortfolio();
  const [subTab, setSubTab] = useState('confirmed');
  const [showDrawer, setShowDrawer] = useState(false);

  const TXN_QUERY_KEY = ["portfolio", activePortfolioId, "transactions"];

  const { data: txns = [], isLoading, isError, refetch } = useQuery({
    queryKey: TXN_QUERY_KEY,
    queryFn:  () => apiService.listTransactions(activePortfolioId),
    enabled:  !!activePortfolioId,
  });

  const handleSaved = useCallback(() => {
    qc.invalidateQueries({ queryKey: TXN_QUERY_KEY });
    setShowDrawer(false);
  }, [qc, activePortfolioId]);

  return (
    <>
      {/* page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:20, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:10.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--ink-40)', fontWeight:600, marginBottom:4 }}>Ledger</div>
          <h1 style={{ fontFamily:'var(--font-heading)', fontSize:24, fontWeight:700, color:'var(--ink-00)', margin:0, letterSpacing:'-0.02em' }}>Transactions</h1>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button disabled title="Coming soon" style={{ height:36, padding:'0 14px', borderRadius:7, fontSize:12.5, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', color:'var(--ink-40)', cursor:'not-allowed', fontFamily:'var(--font-ui)', display:'inline-flex', alignItems:'center', gap:6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Import CSV
          </button>
          <button onClick={() => setShowDrawer(true)} className="du3-cta" style={{ height:36, padding:'0 16px', display:'inline-flex', alignItems:'center', gap:7, background:'rgba(201,168,106,0.14)', border:'1px solid rgba(201,168,106,0.35)', color:'var(--aurum-100)', cursor:'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            New transaction
          </button>
        </div>
      </div>

      {/* sub-tabs */}
      <div style={{ display:'flex', gap:4, paddingBottom:20, flexWrap:'wrap' }}>
        {SUB_TABS.map(t => {
          const on = t.id === subTab;
          const count = t.id === 'confirmed' ? txns.length : undefined;
          return (
            <button key={t.id} onClick={() => setSubTab(t.id)} style={{ display:'inline-flex', alignItems:'center', gap:7, height:34, padding:'0 14px', borderRadius:8, border:'1px solid '+(on?'rgba(201,168,106,0.28)':'rgba(255,255,255,0.07)'), background:on?'rgba(201,168,106,0.10)':'rgba(255,255,255,0.03)', color:on?'var(--aurum-100)':'var(--ink-30)', fontSize:13, fontWeight:on?600:500, cursor:'pointer', fontFamily:'var(--font-ui)', transition:'all 120ms' }}>
              {t.label}
              {count != null && (
                <span style={{ fontFamily:'var(--font-mono)', fontSize:10, padding:'1px 6px', borderRadius:999, background:on?'rgba(201,168,106,0.25)':'rgba(255,255,255,0.06)', color:on?'var(--aurum-100)':'var(--ink-40)' }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* tab content */}
      {subTab === 'confirmed' && (
        <TransactionsLedger
          txns={txns}
          isLoading={isLoading}
          isError={isError}
          refetch={refetch}
          onAdd={() => setShowDrawer(true)}
          onMutated={() => qc.invalidateQueries({ queryKey: TXN_QUERY_KEY })}
        />
      )}
      {subTab === 'pending' && <PendingImportsEmpty/>}
      {subTab === 'history' && <ImportHistoryEmpty/>}

      <div style={{ height:32 }}/>

      {showDrawer && (
        <TransactionDrawer
          mode="create"
          txn={null}
          onClose={() => setShowDrawer(false)}
          onSaved={handleSaved}
        />
      )}

      <style>{`@keyframes shimmerPulse { from { opacity:0.4 } to { opacity:0.7 } }`}</style>
    </>
  );
}

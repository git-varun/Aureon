import React from 'react';

const TXN_STYLE = {
  BUY:     { bg:'rgba(111,174,136,0.12)', col:'var(--sage-500)',    lbl:'Buy'    },
  SELL:    { bg:'rgba(209,107,107,0.12)', col:'var(--crimson-500)', lbl:'Sell'   },
  DIVIDEND:{ bg:'rgba(201,168,106,0.12)', col:'var(--aurum-300)',   lbl:'Div'    },
  CONTRIB: { bg:'rgba(122,168,212,0.12)', col:'#7AA8D4',            lbl:'Contrib'},
  SPLIT:   { bg:'rgba(255,255,255,0.06)', col:'var(--ink-20)',      lbl:'Split'  },
};

export function PfActivityFeed({ txns, onViewAll }) {
  const rows = txns || [];
  if (!rows.length) return (
    <div style={{ padding:'40px 24px', textAlign:'center', border:'1px dashed rgba(255,255,255,0.10)', borderRadius:12, background:'rgba(255,255,255,0.012)' }}>
      <div style={{ fontFamily:'var(--font-heading)', fontSize:15, fontWeight:600, color:'var(--ink-20)', marginBottom:6 }}>No activity</div>
      <div style={{ fontSize:13, color:'var(--ink-40)', maxWidth:400, margin:'0 auto', lineHeight:1.6 }}>Your transaction history will appear here after you import or log trades.</div>
    </div>
  );
  return (
    <div style={{ borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 18px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontFamily:'var(--font-heading)', fontSize:14, fontWeight:600, color:'var(--ink-10)' }}>Recent transactions</span>
        {onViewAll && <button onClick={onViewAll} className="du3-cta ghost" style={{ fontSize:11.5, padding:'0 8px', height:26 }}>Full ledger →</button>}
      </div>
      <div style={{ maxHeight:400, overflowY:'auto' }}>
      {rows.map((t, idx) => {
        const txnType = (t.transaction_type || t.type || 'BUY').toUpperCase();
        const s = TXN_STYLE[txnType] || TXN_STYLE.BUY;
        const gross = t.amount != null ? t.amount : ((t.quantity || t.qty || 0) * (t.price || 0));
        const inflow = txnType === 'SELL' || txnType === 'DIVIDEND';
        const fmtGross = gross >= 1e6 ? `$${(gross/1e6).toFixed(2)}M` : gross >= 1e3 ? `$${(gross/1e3).toFixed(1)}K` : `$${gross.toFixed(0)}`;
        const ticker = t.symbol || t.ticker || '—';
        const name   = t.name || t.notes || ticker;
        const broker = t.broker || t.source || '—';
        const date   = t.date || (t.created_at ? t.created_at.slice(0,10) : '—');
        const region = t.region || '—';
        return (
          <div key={t.id || idx} style={{ display:'grid', gridTemplateColumns:'68px 1fr auto 48px', gap:12, padding:'10px 18px', borderBottom:'1px solid rgba(255,255,255,0.025)', alignItems:'center' }}>
            <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'2px 0', borderRadius:4, background:s.bg, color:s.col, fontSize:10, fontWeight:600, letterSpacing:'0.10em', textTransform:'uppercase' }}>{s.lbl}</span>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:12.5, color:'var(--ink-00)', fontWeight:600, letterSpacing:'0.03em' }}>{ticker}</span>
                <span style={{ fontSize:12, color:'var(--ink-40)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:220 }}>{name}</span>
              </div>
              <span style={{ fontSize:10.5, color:'var(--ink-50)' }}>{broker} · {date}</span>
            </div>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:12.5, color:inflow?'var(--sage-500)':'var(--crimson-500)', fontWeight:500 }}>{inflow?'+':'−'}{fmtGross}</span>
            <span style={{ fontSize:10, color:'var(--ink-50)', padding:'1px 5px', borderRadius:3, border:'1px solid rgba(255,255,255,0.06)', textAlign:'center' }}>{region}</span>
          </div>
        );
      })}
      </div>
    </div>
  );
}

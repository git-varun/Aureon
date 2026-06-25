import React, { useState } from 'react';
import { useApp } from '@/components/aureon/store';
import { ErrorState } from '@/components/aureon/ds.jsx';

const KIND_MAP = {
  applied:      { col: 'var(--sage-500)',   bg: 'rgba(111,174,136,0.15)',   icon: '✓' },
  dismissed:    { col: 'var(--ink-40)',      bg: 'rgba(255,255,255,0.06)',   icon: '✕' },
  contribution: { col: '#7AA8D4',            bg: 'rgba(122,168,212,0.15)',   icon: '+' },
  reversal:     { col: 'var(--dusk-500)',    bg: 'rgba(212,162,87,0.15)',    icon: '↺' },
};
const GRAY = { col: 'var(--ink-50)', bg: 'rgba(255,255,255,0.05)' };

const HistoryKindDot = ({ kind, reversed }) => {
  const m = KIND_MAP[kind] || KIND_MAP.dismissed;
  const col = reversed ? GRAY.col : m.col;
  const bg  = reversed ? GRAY.bg  : m.bg;
  return (
    <span style={{width:26,height:26,borderRadius:999,flexShrink:0,display:'inline-flex',alignItems:'center',justifyContent:'center',background:bg,color:col,fontSize:12}}>
      {m.icon}
    </span>
  );
};

const OutcomeCell = ({ a }) => {
  if (a.kind !== 'applied') return null;
  if (a.reversed) {
    return <span style={{fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--ink-50)'}}>—</span>;
  }
  if (!a.realized) {
    return (
      <span style={{display:'inline-flex',flexDirection:'column',alignItems:'flex-end',gap:1}}>
        <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'#7AA8D4'}}>settling</span>
        {a.settleDays && <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--ink-50)'}}>~{a.settleDays}d</span>}
      </span>
    );
  }
  return (
    <span style={{display:'inline-flex',flexDirection:'column',alignItems:'flex-end',gap:1}}>
      <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--sage-500)',fontWeight:500}}>{a.realized}</span>
      {a.predicted && <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--ink-50)'}}>vs {a.predicted}</span>}
    </span>
  );
};

const HistorySkeleton = () => (
  <>
    <style>{`@keyframes hpulse{0%,100%{opacity:.12}50%{opacity:.28}}`}</style>
    <div style={{display:'flex',flexDirection:'column',gap:2,animation:'hpulse 1.8s ease-in-out infinite'}}>
      {Array.from({length:6}).map((_,i) => (
        <div key={i} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 16px',background:'rgba(255,255,255,0.018)',borderRadius:8}}>
          <div style={{width:26,height:26,borderRadius:999,background:'rgba(255,255,255,0.08)',flexShrink:0}}/>
          <div style={{flex:1,display:'flex',flexDirection:'column',gap:5}}>
            <div style={{height:11,width:'55%',background:'rgba(255,255,255,0.08)',borderRadius:3}}/>
            <div style={{height:10,width:'35%',background:'rgba(255,255,255,0.05)',borderRadius:3}}/>
          </div>
          <div style={{width:40,height:11,background:'rgba(255,255,255,0.05)',borderRadius:3}}/>
        </div>
      ))}
    </div>
  </>
);

const HistoryError = ({ onRetry }) => (
  <div style={{padding:'32px 24px',textAlign:'center',borderRadius:12,background:'rgba(200,60,60,0.06)',border:'1px solid rgba(200,60,60,0.15)'}}>
    <ErrorState onRetry={onRetry} />
  </div>
);

const HistoryStatsBar = ({ activity, kind, setKind }) => {
  const counts = {
    total:        activity.length,
    applied:      activity.filter(a => a.kind === 'applied').length,
    dismissed:    activity.filter(a => a.kind === 'dismissed').length,
    contribution: activity.filter(a => a.kind === 'contribution').length,
    reversal:     activity.filter(a => a.kind === 'reversal').length,
  };
  return (
    <div style={{display:'flex',alignItems:'flex-end',gap:24,paddingBottom:18,borderBottom:'1px solid rgba(255,255,255,0.05)',marginBottom:18,flexWrap:'wrap'}}>
      <div>
        <div style={{fontSize:10.5,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,marginBottom:4}}>Total</div>
        <div style={{fontFamily:'var(--font-mono)',fontSize:36,fontWeight:500,color:'var(--ink-00)',lineHeight:1}}>{counts.total}</div>
        <div style={{fontSize:11.5,color:'var(--ink-30)',marginTop:4}}>entries</div>
      </div>
      <div>
        <div style={{fontSize:10.5,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,marginBottom:4}}>Applied</div>
        <div style={{fontFamily:'var(--font-mono)',fontSize:22,color:'var(--sage-500)',marginTop:4}}>{counts.applied}</div>
      </div>
      <div>
        <div style={{fontSize:10.5,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,marginBottom:4}}>Dismissed</div>
        <div style={{fontFamily:'var(--font-mono)',fontSize:22,color:'var(--ink-30)',marginTop:4}}>{counts.dismissed}</div>
      </div>
      <div>
        <div style={{fontSize:10.5,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,marginBottom:4}}>Contributions</div>
        <div style={{fontFamily:'var(--font-mono)',fontSize:22,color:'var(--ink-10)',marginTop:4}}>{counts.contribution}</div>
      </div>
      {counts.reversal > 0 && (
        <div>
          <div style={{fontSize:10.5,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,marginBottom:4}}>Corrections</div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:22,color:'var(--dusk-500)',marginTop:4}}>{counts.reversal}</div>
        </div>
      )}
      <div style={{flex:1}}/>
      <div style={{display:'flex',gap:6,padding:4,borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
        {[['all','All'],['applied','Applied'],['dismissed','Dismissed'],['contribution','Contributions']].map(([k,l]) => (
          <button key={k} onClick={() => setKind(k)} style={{padding:'5px 12px',fontSize:11.5,borderRadius:6,border:'none',cursor:'pointer',background:kind===k?'rgba(255,255,255,0.07)':'transparent',color:kind===k?'var(--ink-00)':'var(--ink-30)'}}>{l}</button>
        ))}
      </div>
    </div>
  );
};

function RecHistory({ activity }) {
  const [kind, setKind] = useState('all');

  const filtered = activity.filter(a => kind === 'all' || a.kind === kind);

  if (activity.length === 0) {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,minHeight:'30vh',textAlign:'center'}}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <div style={{fontSize:14,color:'var(--ink-20)',fontWeight:500}}>No history yet</div>
        <div style={{fontSize:12,color:'var(--ink-40)',maxWidth:300,lineHeight:1.6}}>Applied and dismissed decisions will appear here as a timestamped ledger.</div>
      </div>
    );
  }

  const groups = {};
  filtered.forEach(a => {
    const day = a.ts.includes('·') ? a.ts.split('·')[0].trim() : a.ts.split(' ')[0].trim();
    (groups[day] = groups[day] || []).push(a);
  });

  return (
    <>
      <HistoryStatsBar activity={activity} kind={kind} setKind={setKind} />

      {filtered.length === 0 && kind !== 'all' ? (
        <div style={{padding:'36px 24px',textAlign:'center',border:'1px dashed rgba(255,255,255,0.08)',borderRadius:12,background:'rgba(255,255,255,0.01)'}}>
          <div style={{fontSize:13,color:'var(--ink-30)'}}>No {kind} entries to show.</div>
        </div>
      ) : (
        Object.entries(groups).map(([day, items]) => (
          <section key={day} style={{marginBottom:20}}>
            <div style={{fontSize:10.5,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,marginBottom:8,paddingLeft:4}}>{day}</div>
            <div style={{borderRadius:11,overflow:'hidden',border:'1px solid rgba(255,255,255,0.06)',background:'rgba(255,255,255,0.018)'}}>
              {items.map((a, idx) => {
                const isMistake   = a.kind === 'reversal' && !a.reversed;
                const isReversal  = a.kind === 'reversal';
                const isReversed  = !!a.reversed;
                const isLastRow   = idx === items.length - 1;
                const tsTime      = a.ts.includes('·') ? (a.ts.split('·')[1]?.trim() || '') : (a.ts.split(' ').slice(1).join(' ') || '');

                let rowStyle = {
                  display:'flex', alignItems:'center', gap:14, padding:'12px 16px',
                  borderBottom: isLastRow ? 'none' : '1px solid rgba(255,255,255,0.04)',
                  opacity: isReversed ? 0.48 : 1,
                };
                if (isMistake) {
                  rowStyle.borderLeft = '2px solid rgba(212,162,87,0.45)';
                  rowStyle.background = 'rgba(212,162,87,0.04)';
                } else if (isReversal) {
                  rowStyle.borderLeft = '2px solid rgba(212,162,87,0.22)';
                }

                return (
                  <div key={a.id || idx} style={rowStyle}>
                    <HistoryKindDot kind={a.kind} reversed={isReversed} />
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap'}}>
                        <span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:600,color:isReversed?'var(--ink-40)':'var(--ink-10)',textDecoration:isReversed?'line-through':'none'}}>{a.action}</span>
                        <span style={{fontFamily:'var(--font-mono)',fontSize:12.5,fontWeight:700,color:'var(--ink-00)'}}>{a.asset}</span>
                        {isReversed && (
                          <span style={{fontSize:10,padding:'1px 6px',borderRadius:4,background:'rgba(255,255,255,0.06)',color:'var(--ink-40)',fontWeight:600,letterSpacing:'0.04em'}}>REVERSED</span>
                        )}
                        {isMistake && (
                          <span style={{fontSize:10,padding:'1px 6px',borderRadius:4,background:'rgba(212,162,87,0.15)',color:'var(--dusk-500)',fontWeight:600,letterSpacing:'0.04em'}}>MISTAKE</span>
                        )}
                      </div>
                      {a.detail && (
                        <div style={{fontSize:11.5,color:'var(--ink-40)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.detail}</div>
                      )}
                    </div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2,flexShrink:0}}>
                      <OutcomeCell a={a} />
                      {tsTime && <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--ink-60)'}}>{tsTime}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
      <div style={{height:32}}/>
    </>
  );
}

export default function DecisionHistoryTab({ tabState = 'ready', onRetry }) {
  const { activity } = useApp();

  if (tabState === 'loading') {
    return <HistorySkeleton />;
  }
  if (tabState === 'error') {
    return <HistoryError onRetry={onRetry} />;
  }
  return <RecHistory activity={activity} />;
}

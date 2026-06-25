import React from 'react';
import { ErrorState } from '@/components/aureon/ds.jsx';

const _DTabEmpty = ({ title, body }) => (
  <div style={{padding:'36px 24px',textAlign:'center',border:'1px dashed rgba(255,255,255,0.08)',borderRadius:12,background:'rgba(255,255,255,0.01)'}}>
    <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:600,color:'var(--ink-10)',marginBottom:6}}>{title}</div>
    <div style={{fontSize:12.5,color:'var(--ink-40)',maxWidth:400,margin:'0 auto',lineHeight:1.6}}>{body}</div>
  </div>
);

export default function AccuracyTab({ tabState = 'ready', onRetry }) {
  if (tabState === 'loading') {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'30vh',color:'var(--ink-40)',fontSize:13}}>
        Loading…
      </div>
    );
  }
  if (tabState === 'error') {
    return <ErrorState onRetry={onRetry} />;
  }
  return (
    <_DTabEmpty
      title="Historical Accuracy"
      body="Historical accuracy tracking will appear here once sufficient outcome data has accumulated."
    />
  );
}

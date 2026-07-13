import React from 'react';
import { ErrorState, NotBuiltState } from '@/components/aureon/ds.jsx';

export default function PerformanceTab({ tabState = 'ready', onRetry }) {
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
    <NotBuiltState
      title="AI Performance"
      body="AI performance tracking isn't built yet — there's no pipeline evaluating recommendation quality over time."
    />
  );
}

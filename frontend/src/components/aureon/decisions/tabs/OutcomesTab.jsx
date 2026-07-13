import React from 'react';
import { ErrorState, NotBuiltState } from '@/components/aureon/ds.jsx';

export default function OutcomesTab({ tabState = 'ready', onRetry }) {
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
      title="Recommendation Outcomes"
      body="Outcome tracking isn't built yet — there's no endpoint that measures how applied recommendations performed."
    />
  );
}

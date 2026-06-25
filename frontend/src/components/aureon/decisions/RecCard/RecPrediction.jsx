import React from 'react';

export default function RecPrediction({ action, impactOneLine }) {
  if (!action && !impactOneLine) return null;

  return (
    <div style={{
      padding:     '11px 14px',
      borderRadius: 9,
      background:  'rgba(201,168,106,0.07)',
      border:      '1px solid rgba(201,168,106,0.18)',
      display:     'flex',
      alignItems:  'center',
      gap:         10,
    }}>
      {action && (
        <span style={{
          fontFamily:  'var(--font-mono)',
          fontSize:    12,
          fontWeight:  700,
          color:       'var(--ink-00)',
        }}>
          {action}
        </span>
      )}
      {impactOneLine && (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize:   12.5,
          color:      'var(--aurum-100)',
        }}>
          {impactOneLine}
        </span>
      )}
    </div>
  );
}

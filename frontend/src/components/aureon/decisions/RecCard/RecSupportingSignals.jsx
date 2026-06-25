import React from 'react';

const SEVERITY_STYLE = {
  high: {
    background: 'rgba(201,82,82,0.15)',
    border:     '1px solid rgba(201,82,82,0.30)',
    color:      'var(--crimson-400)',
  },
  med: {
    background: 'rgba(201,168,106,0.12)',
    border:     '1px solid rgba(201,168,106,0.25)',
    color:      'var(--aurum-100)',
  },
  low: {
    background: 'rgba(255,255,255,0.05)',
    border:     '1px solid rgba(255,255,255,0.10)',
    color:      'var(--ink-40)',
  },
};

const RecSupportingSignals = React.memo(function RecSupportingSignals({ signals }) {
  if (!signals || signals.length === 0) {
    return (
      <span style={{ fontStyle: 'italic', color: 'var(--ink-40)' }}>
        Model-initiated — no directly linked signals.
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {signals.map((signal, i) => {
        const severityKey = signal.severity?.toLowerCase() || 'low';
        const sStyle = SEVERITY_STYLE[severityKey] || SEVERITY_STYLE.low;

        return (
          <div key={signal.id ?? i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{
              padding:       '1px 6px',
              borderRadius:  3,
              flexShrink:    0,
              marginTop:     1,
              fontSize:      9,
              fontWeight:    600,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              ...sStyle,
            }}>
              {signal.severity ?? 'low'}
            </span>

            <div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-10)', lineHeight: 1.5 }}>
                {signal.text}
              </div>
              {(signal.kind || signal.ts) && (
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize:   10.5,
                  color:      'var(--ink-40)',
                  marginTop:  2,
                }}>
                  {[signal.kind, signal.ts].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default RecSupportingSignals;

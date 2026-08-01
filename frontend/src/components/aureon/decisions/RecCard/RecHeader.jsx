import React from 'react';
import { ConfidenceIndicator } from '@/components/aureon/primitives';
import { fmtImpactOneLine, fmtAge } from '../utils/recommendation';
import RecStatusBadge from './RecStatusBadge';

export default function RecHeader({ rec, status, age }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
      {/* Left */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Row 1: action badge + title + status badge */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          8,
          flexWrap:     'wrap',
          marginBottom: 3,
        }}>
          <span style={{
            display:       'inline-flex',
            alignItems:    'center',
            height:        22,
            padding:       '0 8px',
            borderRadius:  5,
            flexShrink:    0,
            marginTop:     2,
            background:    'rgba(255,255,255,0.05)',
            border:        '1px solid rgba(255,255,255,0.08)',
            fontFamily:    'var(--font-mono)',
            fontSize:      10.5,
            fontWeight:    700,
            color:         'var(--ink-00)',
            letterSpacing: '0.06em',
          }}>
            {rec.action}
          </span>
          <span className="du3-title" style={{ fontSize: 14.5 }}>{rec.title}</span>
          <RecStatusBadge status={status} />
        </div>
        {/* Row 2: impact one-liner */}
        <div className="du3-impact">{fmtImpactOneLine(rec)}</div>
      </div>

      {/* Right */}
      <div style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'flex-end',
        gap:            4,
        flexShrink:     0,
      }}>
        <ConfidenceIndicator score={rec.confidence} variant="compact" />
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize:   10,
          color:      'var(--ink-50)',
        }}>
          {fmtAge(age)}
        </span>
      </div>
    </div>
  );
}

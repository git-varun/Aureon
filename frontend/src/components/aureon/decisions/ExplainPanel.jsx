import React, { useEffect } from 'react';
import { REC_STATUS } from './constants.js';
import RecStatusBadge from './RecCard/RecStatusBadge.jsx';
import RecSupportingSignals from './RecCard/RecSupportingSignals.jsx';
import RecPrediction from './RecCard/RecPrediction.jsx';
import DecisionLineageInline from './DecisionLineageInline.jsx';
import { ConfidenceIndicator, ReasoningList, ImpactPreviewPanel } from '@/components/aureon/primitives.jsx';

function Section({ label, children }) {
  return (
    <section>
      <div style={{
        fontSize:      9,
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
        color:         'var(--ink-50)',
        fontWeight:    700,
        marginBottom:  10,
      }}>
        {label}
      </div>
      {children}
    </section>
  );
}

export default function ExplainPanel({ rec, status, signals, onClose, onApply, onDismiss }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  if (!rec) return null;

  const showFooter = status === REC_STATUS.ACTIVE || status === REC_STATUS.CONFLICT;
  const isConflict = status === REC_STATUS.CONFLICT;

  return (
    <>
      <style>{`
        @keyframes aureon-explain-drawerIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:       'fixed',
          inset:          0,
          zIndex:         200,
          background:     'rgba(0,0,0,0.42)',
          backdropFilter: 'blur(3px)',
        }}
      />

      {/* Drawer */}
      <div style={{
        position:       'fixed',
        top:            0,
        right:          0,
        bottom:         0,
        zIndex:         201,
        width:          'min(440px, 96vw)',
        background:     'rgba(13,15,19,0.99)',
        borderLeft:     '1px solid rgba(255,255,255,0.08)',
        boxShadow:      '-28px 0 80px rgba(0,0,0,0.55)',
        backdropFilter: 'blur(40px)',
        display:        'flex',
        flexDirection:  'column',
        animation:      'aureon-explain-drawerIn 260ms var(--ease-decel)',
      }}>

        {/* Head */}
        <div style={{
          padding:      '20px 22px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          position:     'sticky',
          top:          0,
          background:   'rgba(13,15,19,0.99)',
          zIndex:       1,
          flexShrink:   0,
          display:      'flex',
          alignItems:   'flex-start',
          justifyContent: 'space-between',
          gap:          12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Kicker row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ color: 'var(--aurum-500)', fontSize: 14, lineHeight: 1 }}>✦</span>
              <span style={{
                fontSize:      9.5,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                color:         'var(--aurum-100)',
                fontWeight:    700,
              }}>
                AI Explanation
              </span>
            </div>

            {/* Title */}
            <h2 style={{
              fontFamily:    'var(--font-heading)',
              fontSize:      17,
              fontWeight:    600,
              color:         'var(--ink-00)',
              letterSpacing: '-0.01em',
              margin:        0,
              lineHeight:    1.25,
              marginBottom:  8,
            }}>
              {rec.title}
            </h2>

            {/* Status row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RecStatusBadge status={status} />
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize:   11,
                color:      'var(--ink-40)',
              }}>
                Conf {rec.confidence}%
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-60)' }}>·</span>
              <span style={{ fontSize: 11, color: 'var(--ink-50)' }}>{rec.ts}</span>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              width:        30,
              height:       30,
              borderRadius: 8,
              background:   'rgba(255,255,255,0.05)',
              border:       '1px solid rgba(255,255,255,0.08)',
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              flexShrink:   0,
              padding:      0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-30)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex:          1,
          overflowY:     'auto',
          padding:       '20px 22px',
          display:       'flex',
          flexDirection: 'column',
          gap:           22,
        }}>

          {/* 1. Impact one-liner */}
          <Section label="Impact">
            <RecPrediction action={rec.action} impactOneLine={rec.impactOneLine} />
          </Section>

          {/* 2. Why Aureon recommends this */}
          {rec.reasoning && (
            <Section label="Why Aureon recommends this">
              <div style={{ display: 'grid', gap: 6 }}>
                {Object.entries(rec.reasoning).map(([k, v]) => (
                  <div key={k} style={{
                    display:             'grid',
                    gridTemplateColumns: '88px 1fr',
                    gap:                 12,
                    alignItems:          'start',
                    padding:             '9px 12px',
                    borderRadius:        8,
                    background:          'rgba(255,255,255,0.025)',
                    border:              '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <span style={{
                      fontSize:      11,
                      color:         'var(--ink-40)',
                      textTransform: 'capitalize',
                    }}>
                      {k}
                    </span>
                    <span style={{
                      fontSize:    12.5,
                      color:       'var(--ink-10)',
                      lineHeight:  1.55,
                    }}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 3. Confidence breakdown */}
          <Section label="Confidence breakdown">
            <ConfidenceIndicator score={rec.confidence} variant="full" factors={rec.factors} />
          </Section>

          {/* 4. Supporting signals */}
          <Section label="Supporting signals">
            <RecSupportingSignals signals={signals} status={status} />
          </Section>

          {/* 5. Impact preview */}
          {rec.impact && (
            <Section label="Impact preview">
              <ImpactPreviewPanel impact={rec.impact} />
            </Section>
          )}

          {/* 6. Decision lineage */}
          <Section label="Decision lineage">
            <DecisionLineageInline rec={rec} />
          </Section>

        </div>

        {/* Footer */}
        {showFooter && (
          <div style={{
            padding:    '14px 22px 20px',
            borderTop:  '1px solid rgba(255,255,255,0.07)',
            display:    'flex',
            gap:        8,
            flexShrink: 0,
            background: 'rgba(13,15,19,0.99)',
          }}>
            <button
              className="du3-cta primary"
              onClick={onApply}
              disabled={isConflict}
              style={{
                flex:           1,
                height:         38,
                justifyContent: 'center',
                opacity:        isConflict ? 0.4 : 1,
              }}
            >
              Apply {rec.action} →
            </button>
            <button
              className="du3-cta ghost"
              onClick={onDismiss}
              style={{
                height:  38,
                padding: '0 14px',
              }}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </>
  );
}

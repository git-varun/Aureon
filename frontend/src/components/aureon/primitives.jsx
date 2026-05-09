/* Aureon — Decision primitives (ported from lib/v3-primitives.jsx). */
import React from 'react';
import {band, bandLabel, fmt$} from './utils';

export const ConfidenceIndicator = ({score, variant = 'compact', factors}) => {
    const b = band(score);
    const filled = Math.round(score / 10);
    const segs = Array.from({length: 10}, (_, i) => (
        <span key={i} className={`ci-seg ${i < filled ? 'on' : ''} ${b}`}/>
    ));
    if (variant === 'compact') {
        return (
            <span className="ci-compact" title={`${score}% · ${bandLabel(score)}`}>
        <span className="ci-bar">{segs}</span>
        <span>{score}%</span>
      </span>
        );
    }
    const fmap = factors || {};
    return (
        <div>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8}}>
                <span style={{
                    fontSize: 11,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-30)',
                    fontWeight: 600
                }}>Confidence</span>
                <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    color: 'var(--ink-00)'
                }}>{score}% · {bandLabel(score)}</span>
            </div>
            <div className="ci-bar"
                 style={{gridTemplateColumns: 'repeat(10, 1fr)', gap: 3, marginBottom: 10}}>{segs}</div>
            <div style={{display: 'grid', gap: 4, fontSize: 11.5}}>
                {Object.entries(fmap).map(([k, w]) => (
                    <div key={k} style={{
                        display: 'grid',
                        gridTemplateColumns: '100px 1fr auto',
                        gap: 10,
                        alignItems: 'center',
                        color: 'var(--ink-20)'
                    }}>
                        <span style={{textTransform: 'capitalize'}}>{k}</span>
                        <span style={{
                            height: 3,
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: 999,
                            overflow: 'hidden'
                        }}>
              <span style={{
                  display: 'block',
                  height: '100%',
                  width: `${Math.round(w * 100)}%`,
                  background: 'var(--ink-30)'
              }}/>
            </span>
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--ink-30)'
                        }}>{Math.round(w * 100)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const ReasoningList = ({reasoning}) => (
    <div style={{display: 'grid', gap: 6}}>
        {Object.entries(reasoning).map(([k, v]) => (
            <div key={k} style={{
                display: 'grid',
                gridTemplateColumns: '100px 1fr',
                gap: 10,
                fontSize: 12.5,
                color: 'var(--ink-10)'
            }}>
                <span style={{color: 'var(--ink-30)', textTransform: 'capitalize'}}>{k}</span>
                <span>{v}</span>
            </div>
        ))}
    </div>
);

const Stat = ({label, value, sub, tone = 'neu'}) => {
    const color = tone === 'pos' ? 'var(--sage-500)' : tone === 'neg' ? 'var(--crimson-500)' : 'var(--ink-00)';
    return (
        <div style={{
            padding: '8px 10px',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)'
        }}>
            <div style={{
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--ink-30)',
                fontWeight: 600,
                marginBottom: 3
            }}>{label}</div>
            <div style={{fontFamily: 'var(--font-mono)', fontSize: 16, color, fontWeight: 500}}>{value}</div>
            {sub && <div style={{fontSize: 10.5, color: 'var(--ink-40)', marginTop: 2}}>{sub}</div>}
        </div>
    );
};

const AllocBar = ({pct, target, kind}) => {
    const max = Math.max(pct, target, 0.01) * 1.2;
    return (
        <div className={`ip-bar ${kind}`}>
            <i style={{width: `${(pct / max) * 100}%`}}/>
            {target != null && <span className="ip-target" style={{left: `${(target / max) * 100}%`}}/>}
        </div>
    );
};

export const ImpactPreviewPanel = ({impact}) => {
    if (!impact) return null;
    const {risk, ret, alloc, cash} = impact;
    return (
        <div style={{display: 'grid', gap: 12}}>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10}}>
                <Stat label="Cash Δ" value={cash ? fmt$(cash) : '—'}
                      tone={cash > 0 ? 'pos' : cash < 0 ? 'neg' : 'neu'}/>
                <Stat label="Return" value={ret?.delta || '—'} sub={ret?.horizon}/>
                <Stat label={`Risk Δ (${risk?.unit || 'β'})`}
                      value={risk?.delta != null ? (risk.delta > 0 ? '+' : '') + risk.delta.toFixed(2) : '—'}
                      tone={risk?.delta < 0 ? 'pos' : risk?.delta > 0 ? 'neg' : 'neu'}/>
            </div>
            {alloc && (
                <div className="ip-bars">
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        color: 'var(--ink-30)',
                        fontSize: 10.5,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        fontWeight: 600
                    }}>
                        <span>Allocation before · after · target</span>
                        <span
                            style={{fontFamily: 'var(--font-mono)'}}>{(alloc.before * 100).toFixed(1)}% → {(alloc.after * 100).toFixed(1)}%</span>
                    </div>
                    <AllocBar pct={alloc.before} target={alloc.target} kind="before"/>
                    <AllocBar pct={alloc.after} target={alloc.target} kind="after"/>
                </div>
            )}
        </div>
    );
};

export const AllocationImpactPanel = ({deltas}) => (
    <div className="ai-grid">
        {deltas.map(d => (
            <React.Fragment key={d.className}>
                <span className="lbl">{d.className}</span>
                <span>
          <div className="ip-bar"><i style={{width: `${(d.before / 0.5) * 100}%`}}/></div>
          <div className="ip-bar after" style={{marginTop: 4}}><i style={{width: `${(d.after / 0.5) * 100}%`}}/><span
              className="ip-target" style={{left: `${(d.target / 0.5) * 100}%`}}/></div>
        </span>
                <span className="num">{(d.before * 100).toFixed(1)} → {(d.after * 100).toFixed(1)}%</span>
            </React.Fragment>
        ))}
    </div>
);

export const EvaluatePanel = ({rec, conflicts, onBack, onConfirm, onResolveConflict, confirmLabel}) => {
    const blocked = conflicts && conflicts.length > 0;
    return (
        <div className="ev-panel disclose">
            {blocked && (
                <div className="ev-conflict-strip">
                    <span>⚠</span>
                    <span className="grow">Conflicts with <b>{conflicts.join(', ')}</b> — opposing action on the same asset. Resolve before confirming.</span>
                    <button className="du3-cta" onClick={onResolveConflict}>Resolve</button>
                </div>
            )}
            <div className="ev-grid">
                <div className="ev-block">
                    <h4>Reasoning</h4>
                    <ReasoningList reasoning={rec.reasoning}/>
                </div>
                <div className="ev-block">
                    <h4>Confidence</h4>
                    <ConfidenceIndicator score={rec.confidence} variant="full" recId={rec.id}/>
                </div>
            </div>
            <div className="ev-block">
                <h4>Impact preview (before → after)</h4>
                <ImpactPreviewPanel impact={rec.impact}/>
            </div>
            <div className="ev-actions">
                <div className="left">
                    <button className="du3-cta ghost" onClick={onBack}>← Back</button>
                </div>
                <div className="right">
                    <button className="du3-cta primary" onClick={onConfirm} disabled={blocked}>
                        {confirmLabel || `Confirm ${rec.action}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

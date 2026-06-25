import React from 'react';
import { useAureonData } from '@/hooks/useAureonData';
import { useApp } from '@/components/aureon/store';
import { bandLabel } from '@/components/aureon/utils';

const SEV_TONE = {
    high: 'var(--crimson-500)',
    med: 'var(--aurum-100)',
    low: 'var(--ink-30)',
};

function Arrow() {
    return (
        <svg
            width="22"
            height="12"
            viewBox="0 0 22 12"
            fill="none"
            style={{ flexShrink: 0, alignSelf: 'center' }}
        >
            <path
                d="M1 6h18M14 1l5 5-5 5"
                stroke="var(--ink-50)"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function Node({ kicker, accent, children }) {
    return (
        <div style={{
            flex: '1 1 160px',
            minWidth: 150,
            borderRadius: 9,
            padding: '10px 12px',
            background: 'rgba(255,255,255,0.025)',
            border: `1px solid ${accent || 'rgba(255,255,255,0.07)'}`,
        }}>
            <div style={{
                fontSize: 9,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--ink-40)',
                fontWeight: 600,
                marginBottom: 6,
            }}>
                {kicker}
            </div>
            {children}
        </div>
    );
}

function SignalNode({ sigs }) {
    if (!sigs || sigs.length === 0) {
        return (
            <>
                <div style={{ fontSize: 12, color: 'var(--ink-30)' }}>Model-initiated</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-40)', marginTop: 2 }}>
                    no single triggering signal
                </div>
            </>
        );
    }
    return (
        <div style={{ display: 'grid', gap: 5 }}>
            {sigs.map((s, i) => (
                <div key={s.id || i}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                        <div style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: SEV_TONE[s.severity] || SEV_TONE.low,
                            flexShrink: 0,
                            alignSelf: 'center',
                        }} />
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-10)', textTransform: 'capitalize' }}>
                            {s.kind}
                        </span>
                        {s.ts && (
                            <span style={{ fontFamily: 'monospace', fontSize: 10.5, color: 'var(--ink-40)', marginLeft: 6 }}>
                                {s.ts}
                            </span>
                        )}
                    </div>
                    {s.text && (
                        <div style={{ fontSize: 10.5, color: 'var(--ink-30)', marginTop: 1 }}>
                            {s.text}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function RecNode({ rec }) {
    return (
        <>
            <div style={{ fontSize: 12.5, color: 'var(--ink-00)', fontWeight: 600 }}>
                {rec.action} {rec.scope?.ref}
            </div>
            {rec.impactOneLine && (
                <div style={{ color: 'var(--aurum-100)', fontFamily: 'monospace', fontSize: 11, marginTop: 3 }}>
                    {rec.impactOneLine}
                </div>
            )}
            <div style={{ fontSize: 10.5, color: 'var(--ink-40)', marginTop: 4 }}>
                confidence {rec.confidence}% · {bandLabel(rec.confidence)}
            </div>
        </>
    );
}

function OutcomeNode({ outcome, rec }) {
    if (!outcome) {
        return (
            <>
                <div style={{ fontSize: 12.5, color: 'var(--ink-10)', fontWeight: 600 }}>
                    Awaiting your decision
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-30)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                    expected {rec.impact?.ret?.delta || '—'}
                </div>
                {rec.impact?.ret?.horizon && rec.impact.ret.horizon !== '—' && (
                    <div style={{ fontSize: 10.5, color: 'var(--ink-40)', marginTop: 2 }}>
                        over {rec.impact.ret.horizon}
                    </div>
                )}
            </>
        );
    }

    if (outcome.kind === 'applied') {
        return (
            <>
                <div style={{ fontSize: 12.5, color: 'var(--sage-500)', fontWeight: 600 }}>Applied</div>
                {outcome.realized && (
                    <div style={{ color: 'var(--ink-10)', fontFamily: 'monospace', fontSize: 11, marginTop: 3 }}>
                        realized {outcome.realized}
                    </div>
                )}
                {outcome.predicted && (
                    <div style={{ fontSize: 10.5, color: 'var(--ink-40)', marginTop: 2 }}>
                        vs predicted {outcome.predicted}
                    </div>
                )}
            </>
        );
    }

    if (outcome.kind === 'dismissed') {
        return (
            <>
                <div style={{ fontSize: 12.5, color: 'var(--ink-20)', fontWeight: 600 }}>Dismissed</div>
                {outcome.detail && (
                    <div style={{ fontSize: 10.5, color: 'var(--ink-40)', marginTop: 3 }}>
                        {outcome.detail}
                    </div>
                )}
            </>
        );
    }

    return (
        <div style={{ fontSize: 12.5, color: 'var(--ink-10)', fontWeight: 600 }}>
            Awaiting your decision
        </div>
    );
}

function DecisionLineageInline({ rec }) {
    const { signals } = useAureonData();
    const { activity } = useApp();

    const sigs = signals.filter(s => s.linkedRec === rec.id);

    const outcome = activity.find(
        a => a.asset === rec.scope?.ref &&
             a.action === rec.action &&
             (a.kind === 'applied' || a.kind === 'dismissed')
    );

    const recAccent = 'rgba(201,168,106,0.30)';
    const outcomeAccent = outcome?.kind === 'applied'
        ? 'rgba(111,174,136,0.28)'
        : outcome?.kind === 'dismissed'
            ? 'rgba(255,255,255,0.07)'
            : undefined;

    return (
        <div style={{
            margin: '2px 2px 0',
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.015)',
            border: '1px solid rgba(255,255,255,0.06)',
        }}>
            <div style={{
                fontSize: 9.5,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--ink-40)',
                fontWeight: 600,
                marginBottom: 10,
            }}>
                Decision lineage
            </div>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, flexWrap: 'wrap' }}>
                <Node kicker="Signal">
                    <SignalNode sigs={sigs} />
                </Node>
                <Arrow />
                <Node kicker="Recommendation" accent={recAccent}>
                    <RecNode rec={rec} />
                </Node>
                <Arrow />
                <Node kicker="Outcome" accent={outcomeAccent}>
                    <OutcomeNode outcome={outcome} rec={rec} />
                </Node>
            </div>
        </div>
    );
}

export default React.memo(DecisionLineageInline);

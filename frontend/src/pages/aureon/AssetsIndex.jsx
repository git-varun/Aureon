/* Aureon — Assets index (grouped by class). */
import React, {useMemo} from 'react';
import {useNavigate} from 'react-router-dom';
import {useApp} from '../../components/aureon/store';
import {Sparkline, Eyebrow, TierChip, MiniBar} from '../../components/aureon/ui';
import {valueOf, plOf, plPctOf} from '../../components/aureon/utils';
import {useAureonData} from '../../hooks/useAureonData';
import {fmtMoney} from './marketData';

export default function AssetsIndex() {
    const navigate = useNavigate();
    const {allRecs, active} = useApp();
    const {holdings, classLabel, classTarget, netWorth, allocByClass} = useAureonData();

    const grouped = useMemo(() => {
        const g = {};
        holdings.forEach(h => {
            (g[h.class] = g[h.class] || []).push(h);
        });
        return g;
    }, [holdings]);

    const recsByAsset = useMemo(() => {
        const m = {};
        allRecs.filter(r => active.includes(r.id)).forEach(r => {
            if (r.scope?.kind === 'asset') m[r.scope.ref] = r;
        });
        return m;
    }, [allRecs, active]);

    const order = ['stocks', 'crypto', 'funds', 'bonds', 'real_estate', 'retirement', 'insurance'];

    return (
        <>
            <div style={{padding: '8px 0 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 18}}>
                <Eyebrow>Asset classes</Eyebrow>
                <div style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: 24,
                    fontWeight: 600,
                    color: 'var(--ink-00)',
                    letterSpacing: '-0.015em',
                    marginTop: 6
                }}>
                    {Object.keys(grouped).length} classes · {fmtMoney(netWorth, 'USD', {dp: 0})} under management
                </div>
                <div style={{fontSize: 12, color: 'var(--ink-30)', marginTop: 6, maxWidth: 680}}>
                    Active assets receive real-time signals and recommendations. Semi-active receive low-frequency
                    recommendations. Passive (real estate, retirement, insurance) are tracked for net worth and
                    allocation only.
                </div>
            </div>

            {order.map(cls => {
                const items = grouped[cls] || [];
                if (!items.length) return null;
                const value = items.reduce((s, h) => s + valueOf(h), 0);
                const tier = items[0].tier;
                return (
                    <section key={cls} style={{marginBottom: 24}}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            marginBottom: 10
                        }}>
                            <div style={{display: 'flex', alignItems: 'baseline', gap: 14}}>
                                <h3 style={{
                                    margin: 0,
                                    fontFamily: 'var(--font-heading)',
                                    fontSize: 18,
                                    fontWeight: 600,
                                    color: 'var(--ink-00)',
                                    letterSpacing: '-0.01em'
                                }}>{classLabel[cls]}</h3>
                                <TierChip tier={tier}/>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-30)'}}>
                  {fmtMoney(value, 'USD', {dp: 0})} · {netWorth > 0 ? ((value / netWorth) * 100).toFixed(1) : '0.0'}% · target {((classTarget[cls] || 0) * 100).toFixed(0)}%
                </span>
                            </div>
                            <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                                <div style={{width: 120}}>
                                    <MiniBar value={(allocByClass[cls] || 0)} target={classTarget[cls]} max={0.5}/>
                                </div>
                                <span style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 11,
                                    color: 'var(--ink-40)'
                                }}>{items.length} {items.length === 1 ? 'holding' : 'holdings'}</span>
                            </div>
                        </div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                            gap: 10
                        }}>
                            {items.map(h => (
                                <button key={h.id || h.ticker} onClick={() => navigate('/assets/' + h.ticker)} style={{
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    padding: '12px 14px',
                                    borderRadius: 10,
                                    background: 'rgba(255,255,255,0.025)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    color: 'inherit',
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 8
                                    }}>
                                        <span style={{
                                            fontFamily: 'var(--font-mono)',
                                            fontSize: 13,
                                            fontWeight: 600,
                                            color: 'var(--ink-00)',
                                            letterSpacing: '0.04em'
                                        }}>{h.ticker}</span>
                                        {recsByAsset[h.ticker] && (
                                            <span style={{
                                                fontSize: 9.5,
                                                padding: '2px 6px',
                                                borderRadius: 999,
                                                letterSpacing: '0.10em',
                                                textTransform: 'uppercase',
                                                fontWeight: 600,
                                                background: 'rgba(201,168,106,0.14)',
                                                color: 'var(--aurum-100)'
                                            }}>Rec</span>
                                        )}
                                    </div>
                                    <div style={{
                                        fontSize: 11.5,
                                        color: 'var(--ink-30)',
                                        marginBottom: 10,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>{h.name}</div>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'flex-end',
                                        justifyContent: 'space-between',
                                        gap: 8
                                    }}>
                                        <div>
                                            <div style={{
                                                fontFamily: 'var(--font-mono)',
                                                fontSize: 16,
                                                color: 'var(--ink-00)',
                                                fontWeight: 500
                                            }}>{fmtMoney(valueOf(h), 'USD', {dp: 0})}</div>
                                            <div style={{
                                                fontFamily: 'var(--font-mono)',
                                                fontSize: 11,
                                                color: plOf(h) >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'
                                            }}>
                                                {plOf(h) >= 0 ? '+' : '−'}{(Math.abs(plPctOf(h)) * 100).toFixed(1)}%
                                                all-time
                                            </div>
                                        </div>
                                        {h.tier !== 'passive' &&
                                            <Sparkline data={h.spark?.length ? h.spark : [h.cost, h.price]} w={70}
                                                       h={22}/>}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>
                );
            })}
            <div style={{height: 24}}/>
        </>
    );
}

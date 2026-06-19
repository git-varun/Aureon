import React from 'react';
import {Eyebrow} from '../ui';
import {Stat, SparklineChart} from './primitives';

export function OverviewTab({quote, spark, picked, fmtPrice}) {
    return (
        <div className="overview-tab-grid" style={{display: 'grid', gap: 18, alignItems: 'stretch'}}>
            <style>{`
                .overview-tab-grid {
                    grid-template-columns: 2fr 1fr;
                }
                @media (max-width: 768px) {
                    .overview-tab-grid {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
            
            {/* Chart Card */}
            <div className="layer-1" style={{
                padding: '16px 20px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                minHeight: 180
            }}>
                <div style={{fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 12}}>
                    Sparkline (Price Trend)
                </div>
                <div style={{flex: 1, display: 'flex', alignItems: 'center'}}>
                    <SparklineChart series={spark} dayPct={picked.dayPct}/>
                </div>
            </div>

            {/* Stats Card */}
            <div className="layer-1" style={{
                padding: '16px 20px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 180
            }}>
                <Eyebrow style={{marginBottom: 10}}>Quick stats</Eyebrow>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 18px', marginTop: 4, flex: 1}}>
                    <Stat label="Open"       value={quote?.open           != null ? fmtPrice(quote.open)           : null}/>
                    <Stat label="High"       value={quote?.high           != null ? fmtPrice(quote.high)           : null}/>
                    <Stat label="Low"        value={quote?.low            != null ? fmtPrice(quote.low)            : null}/>
                    <Stat label="Prev close" value={quote?.previous_close != null ? fmtPrice(quote.previous_close) : null}/>
                    <Stat label="52W H"      value={quote?.high_52w       != null ? fmtPrice(quote.high_52w)       : null}/>
                    <Stat label="52W L"      value={quote?.low_52w        != null ? fmtPrice(quote.low_52w)        : null}/>
                    <Stat label="M-cap"      value={picked.mcap || null}/>
                    <Stat label="Sector"     value={picked.sector || null}/>
                </div>
            </div>
        </div>
    );
}

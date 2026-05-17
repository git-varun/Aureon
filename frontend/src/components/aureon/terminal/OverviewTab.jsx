import React from 'react';
import {Eyebrow} from '../ui';
import {Stat, SparklineChart} from './primitives';

export function OverviewTab({quote, spark, picked, fmtPrice}) {
    return (
        <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18}}>
            <SparklineChart series={spark} dayPct={picked.dayPct}/>
            <div>
                <Eyebrow>Quick stats</Eyebrow>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 18px', marginTop: 10}}>
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

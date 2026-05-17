import React from 'react';
import {Stat, TabSkeleton} from './primitives';

export function FundamentalsTab({data, assetClass, fmtPrice, onRefresh}) {
    if (data === null) return <TabSkeleton/>;

    const isCrypto = assetClass === 'crypto';
    const fmt    = v => v != null ? v.toLocaleString(undefined, {maximumFractionDigits: 2}) : null;
    const fmtPct = v => v != null ? `${(v * 100).toFixed(2)}%` : null;

    const rows = isCrypto
        ? [
            ['Market cap',     fmt(data?.market_cap)],
            ['52W High',       data?.high_52w != null ? fmtPrice(data.high_52w) : null],
            ['52W Low',        data?.low_52w  != null ? fmtPrice(data.low_52w)  : null],
            ['Beta',           fmt(data?.beta)],
            ['Vol 30d (ann.)', data?.vol_30d  != null ? `${data.vol_30d}%`       : null],
          ]
        : [
            ['P/E',            fmt(data?.pe_ratio)],
            ['P/B',            fmt(data?.pb_ratio)],
            ['ROE',            fmtPct(data?.roe)],
            ['D/E',            fmt(data?.de_ratio)],
            ['EPS',            fmt(data?.eps)],
            ['Div yield',      fmtPct(data?.dividend_yield)],
            ['Beta',           fmt(data?.beta)],
            ['Vol 30d (ann.)', data?.vol_30d  != null ? `${data.vol_30d}%`       : null],
            ['52W High',       data?.high_52w != null ? fmtPrice(data.high_52w)  : null],
            ['52W Low',        data?.low_52w  != null ? fmtPrice(data.low_52w)   : null],
            ['Graham #',       fmt(data?.graham_number)],
            ['Market cap',     fmt(data?.market_cap)],
          ];

    return (
        <div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px 24px', marginBottom: 16}}>
                {rows.map(([k, v]) => <Stat key={k} label={k} value={v}/>)}
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'}}>
                <span style={{flex: 1, fontSize: 11.5, color: 'var(--ink-40)'}}>
                    {!data
                        ? 'Fundamental data unavailable for this symbol.'
                        : data.data_source === 'cache'
                        ? 'Served from cache · refreshed within 24 h'
                        : data.data_source === 'partial'
                        ? 'Partial data — yfinance returned no fundamentals for this symbol'
                        : 'Live data from yfinance'}
                </span>
                <button onClick={onRefresh} className="du3-cta ghost" style={{padding: '0 12px', height: 28, fontSize: 11}}>
                    Refresh
                </button>
            </div>
        </div>
    );
}

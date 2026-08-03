import React from 'react';
import {Stat, TabSkeleton} from './primitives';

// Fields with no backing source anywhere in Aureon today — see the BACKLOG
// comment on get_fundamentals (backend/app/modules/market/services/assets.py)
// for what each would need. Always rendered as "Unavailable", never a value,
// regardless of what the API response contains for them.
const UNSUPPORTED = new Set(['eps', 'beta', 'vol_30d', 'high_52w', 'low_52w', 'graham_number']);

export function FundamentalsTab({data, assetClass, fmtPrice, onRefresh}) {
    if (data === null) return <TabSkeleton/>;

    const isCrypto = assetClass === 'crypto';
    const fmt    = v => v != null ? v.toLocaleString(undefined, {maximumFractionDigits: 2}) : null;
    const fmtPct = v => v != null ? `${(v * 100).toFixed(2)}%` : null;

    const val = (key, formatted) => UNSUPPORTED.has(key) ? 'Unavailable' : (formatted ?? '—');

    const rows = isCrypto
        ? [
            ['Market cap',     val('market_cap', fmt(data?.market_cap))],
            ['52W High',       val('high_52w', data?.high_52w != null ? fmtPrice(data.high_52w) : null)],
            ['52W Low',        val('low_52w', data?.low_52w  != null ? fmtPrice(data.low_52w)  : null)],
            ['Beta',           val('beta', fmt(data?.beta))],
            ['Vol 30d (ann.)', val('vol_30d', data?.vol_30d  != null ? `${data.vol_30d}%`       : null)],
          ]
        : [
            ['P/E',            val('pe_ratio', fmt(data?.pe_ratio))],
            ['P/B',            val('pb_ratio', fmt(data?.pb_ratio))],
            ['ROE',            val('roe', fmtPct(data?.roe))],
            ['D/E',            val('de_ratio', fmt(data?.de_ratio))],
            ['EPS',            val('eps', fmt(data?.eps))],
            ['Div yield',      val('dividend_yield', fmtPct(data?.dividend_yield))],
            ['Beta',           val('beta', fmt(data?.beta))],
            ['Vol 30d (ann.)', val('vol_30d', data?.vol_30d  != null ? `${data.vol_30d}%`       : null)],
            ['52W High',       val('high_52w', data?.high_52w != null ? fmtPrice(data.high_52w)  : null)],
            ['52W Low',        val('low_52w', data?.low_52w != null ? fmtPrice(data.low_52w)   : null)],
            ['Graham #',       val('graham_number', fmt(data?.graham_number))],
            ['Market cap',     val('market_cap', fmt(data?.market_cap))],
          ];

    const footerText = !data
        ? 'Fundamental data unavailable for this symbol.'
        : data.data_source === 'live'
        ? 'Live data from yfinance'
        : data.data_source === 'cache'
        ? 'Served from cache · refreshed within 24 h'
        : data.data_source === 'partial'
        ? 'Partial data — real fundamentals not yet fetched for this symbol; showing derived scores only where available'
        : 'No fundamentals data available for this symbol yet';

    return (
        <div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px 24px', marginBottom: 16}}>
                {rows.map(([k, v]) => <Stat key={k} label={k} value={v}/>)}
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'}}>
                <span style={{flex: 1, fontSize: 11.5, color: 'var(--ink-40)'}}>{footerText}</span>
                <button onClick={onRefresh} className="du3-cta ghost" style={{padding: '0 12px', height: 28, fontSize: 11}}>
                    Refresh
                </button>
            </div>
        </div>
    );
}

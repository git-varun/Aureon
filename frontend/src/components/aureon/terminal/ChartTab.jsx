import React from 'react';
import TradingViewChart from '../../TradingViewChart';

export function ChartTab({sym, assetClass}) {
    return (
        <div style={{height: 480, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)'}}>
            <TradingViewChart symbol={sym} assetType={assetClass}/>
        </div>
    );
}

import React from 'react';
import Watchlist from './Watchlist';
import TradingViewChart from './TradingViewChart';
import AssetPanel from './AssetPanel';

export default function Terminal({state, selectedSymbol, setSelectedSymbol, showLeft, showRight}) {
    const activeAsset = state?.assets?.find(a => a.symbol === selectedSymbol);
    const activeDirective = state?.briefing?.directives?.find(d => d.symbol === selectedSymbol);
    const activeNews = state?.news?.[selectedSymbol];

    // Dynamically calculate grid columns based on toggle states
    let gridCols = '';
    if (showLeft && showRight) gridCols = '320px minmax(0, 1fr) 350px';
    else if (showLeft && !showRight) gridCols = '320px minmax(0, 1fr)';
    else if (!showLeft && showRight) gridCols = 'minmax(0, 1fr) 350px';
    else gridCols = 'minmax(0, 1fr)';

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            gap: '1px',
            flex: 1,
            overflow: 'hidden',
            backgroundColor: '#2A2E39'
        }}>

            {showLeft && (
                <div style={{backgroundColor: '#131722', display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
                    <Watchlist assets={state.assets} selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol}/>
                </div>
            )}

            <div style={{backgroundColor: '#131722', display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
                {/* 🚀 THE NEW SUPERCHART */}
                <TradingViewChart assetType={activeAsset?.type} symbol={selectedSymbol}/>
            </div>

            {showRight && (
                <div style={{backgroundColor: '#131722', display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
                    <AssetPanel asset={activeAsset} directive={activeDirective} news={activeNews}/>
                </div>
            )}
        </div>
    );
}
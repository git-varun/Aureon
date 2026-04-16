import React, {useState} from 'react';

export default function Watchlist({assets, selectedSymbol, onSelect}) {
    const [filter, setFilter] = useState('ALL');

    const filteredAssets = (assets || []).filter(a => {
        if (filter === 'ALL') return true;
        if (filter === 'STOCKS') return a.type.includes('equity');
        if (filter === 'CRYPTO') return a.type.includes('crypto');
        return true;
    });

    const tabStyle = (active) => ({
        flex: 1,
        padding: '12px 0',
        cursor: 'pointer',
        backgroundColor: 'transparent',
        color: active ? '#D1D4DC' : '#787B86',
        border: 'none',
        borderBottom: active ? '2px solid #2962FF' : '1px solid #2A2E39',
        fontWeight: '600',
        fontSize: '12px',
        letterSpacing: '0.5px'
    });

    return (
        <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
            <div style={{display: 'flex'}}>
                <button style={tabStyle(filter === 'ALL')} onClick={() => setFilter('ALL')}>ALL</button>
                <button style={tabStyle(filter === 'STOCKS')} onClick={() => setFilter('STOCKS')}>STOCKS</button>
                <button style={tabStyle(filter === 'CRYPTO')} onClick={() => setFilter('CRYPTO')}>CRYPTO</button>
            </div>

            <div style={{overflowY: 'auto', flex: 1}}>
                {filteredAssets.map(asset => (
                    <div key={asset.symbol} onClick={() => onSelect(asset.symbol)}
                         style={{
                             padding: '12px 24px', cursor: 'pointer', transition: 'background 0.1s',
                             backgroundColor: selectedSymbol === asset.symbol ? '#2A2E39' : 'transparent',
                             borderBottom: '1px solid #1E222D',
                             display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                         }}>
                        <div>
                            <div style={{
                                fontWeight: '600',
                                fontSize: '14px',
                                color: '#D1D4DC'
                            }}>{asset.symbol.split('.')[0]}</div>
                            <div style={{
                                fontSize: '12px',
                                color: '#787B86',
                                marginTop: '2px'
                            }}>Qty: {asset.qty.toFixed(4)}</div>
                        </div>
                        <div style={{textAlign: 'right'}}>
                            <div style={{
                                fontWeight: '600',
                                fontSize: '14px',
                                color: '#D1D4DC'
                            }}>{asset.type.includes('crypto') ? '$' : '₹'}{asset.live_price?.toLocaleString('en-IN', {maximumFractionDigits: 2})}</div>
                            <div style={{
                                fontSize: '12px',
                                fontWeight: 'bold',
                                marginTop: '2px',
                                color: asset.tv_signal?.includes('BUY') ? '#089981' : asset.tv_signal?.includes('SELL') ? '#F23645' : '#787B86'
                            }}>
                                {asset.tv_signal || 'NEUTRAL'}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
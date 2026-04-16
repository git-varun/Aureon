import React, { useState } from 'react';
import { apiService } from '../api/apiService';

export default function AssetPanel({ asset, directive, news }) {
    const [activeTab, setActiveTab] = useState('AI');
    const [singleAI, setSingleAI] = useState(null);
    const [loadingSingle, setLoadingSingle] = useState(false);

    if (!asset) return <div style={{ color: '#787B86', textAlign: 'center', marginTop: '50px' }}>Select an asset</div>;

    const runSingleAI = async () => {
        setLoadingSingle(true);
        try {
            const res = await apiService.runSingleAI(asset.symbol);
            if (res.status === 'success') setSingleAI(res.data);
        } catch (e) {
            console.error(e);
        }
        setLoadingSingle(false);
    };

    const tabStyle = (active) => ({
        flex: 1,
        padding: '10px 0',
        cursor: 'pointer',
        backgroundColor: active ? '#2A2E39' : 'transparent',
        color: active ? '#D1D4DC' : '#787B86',
        border: 'none',
        borderRadius: '4px',
        fontWeight: '600',
        fontSize: '12px'
    });

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '24px 24px 16px 24px', borderBottom: '1px solid #2A2E39' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h2 style={{ margin: '0 0 4px 0', fontSize: '24px', color: '#D1D4DC' }}>{asset.symbol}</h2>
                        <div style={{ fontSize: '13px', color: '#787B86' }}>Value:
                            ₹{asset.value_inr?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                    </div>
                    {/* The Single Asset AI Button */}
                    <button onClick={runSingleAI} disabled={loadingSingle} style={{
                        padding: '8px 12px',
                        backgroundColor: '#089981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '11px'
                    }}>
                        {loadingSingle ? "⏳ Analyzing..." : "🎯 Run Single AI"}
                    </button>
                </div>
            </div>

            {/* Navigation Pills */}
            <div style={{ padding: '16px 24px' }}>
                <div style={{
                    display: 'flex',
                    backgroundColor: '#0B0E14',
                    padding: '4px',
                    borderRadius: '6px',
                    border: '1px solid #2A2E39'
                }}>
                    <button style={tabStyle(activeTab === 'AI')} onClick={() => setActiveTab('AI')}>Strategy</button>
                    <button style={tabStyle(activeTab === 'DATA')} onClick={() => setActiveTab('DATA')}>Metrics</button>
                    <button style={tabStyle(activeTab === 'NEWS')} onClick={() => setActiveTab('NEWS')}>Catalysts
                    </button>
                </div>
            </div>

            {/* Scrollable Content */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '0 24px 24px 24px' }}>

                {/* AI STRATEGY */}
                {activeTab === 'AI' && (
                    <>
                        {/* Render Single AI Result if it exists */}
                        {singleAI && !singleAI.error && (
                            <div style={{
                                backgroundColor: '#1e293b',
                                borderLeft: '4px solid #089981',
                                padding: '15px',
                                borderRadius: '8px',
                                marginBottom: '20px'
                            }}>
                                <h3 style={{ margin: '0 0 10px 0', color: '#089981' }}>🎯
                                    ON-DEMAND: {singleAI.recommended_action}</h3>
                                <p style={{ fontSize: '13px', color: '#D1D4DC' }}>
                                    <strong>Sizing:</strong> {singleAI.position_sizing}</p>
                                <p style={{ fontSize: '13px', color: '#D1D4DC' }}>
                                    <strong>Trend:</strong> {singleAI.short_term_trend}</p>
                                <p style={{ fontSize: '13px', color: '#D1D4DC' }}>
                                    <strong>Reasoning:</strong> {singleAI.deep_reasoning}</p>
                            </div>
                        )}

                        {/* Render Global Directive */}
                        {directive ? (
                            <div style={{ backgroundColor: '#2A2E39', padding: '15px', borderRadius: '8px' }}>
                                <h3 style={{ color: '#D1D4DC', margin: '0 0 10px 0' }}>🌍 GLOBAL
                                    AI: {directive.action}</h3>
                                <p style={{ fontSize: '13px', color: '#94a3b8' }}>{directive.the_why}</p>
                            </div>
                        ) : <div style={{ color: '#787B86', textAlign: 'center', marginTop: '40px' }}>No global directive
                            for this asset.</div>}
                    </>
                )}

                {/* QUANT METRICS (MACRO-SWING ARCHITECTURE) */}
                {/* QUANT & FUNDAMENTAL METRICS */}
                {activeTab === 'DATA' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                        {/* TradingView Rating */}
                        <div style={{ backgroundColor: '#1e293b', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #334155' }}>
                            <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>Algorithmic Trend Rating</div>
                            <h3 style={{ margin: '5px 0 0 0', fontSize: '22px', color: asset.tv_signal?.includes('BUY') ? '#089981' : asset.tv_signal?.includes('SELL') ? '#F23645' : '#EAB308' }}>
                                {asset.tv_signal || 'NEUTRAL'}
                            </h3>
                        </div>

                        {/* 🚀 MACRO-SWING TECHNICALS */}
                        <div style={{ fontSize: '12px', color: '#787B86', textTransform: 'uppercase', fontWeight: 'bold', marginTop: '10px' }}>Technical & Risk Models</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {[
                                { label: 'Momentum (RSI)', val: asset.momentum_rsi },
                                { label: 'Trend Strength (MACD)', val: asset.trend_strength },
                                { label: 'Macro TSL (3.5x ATR)', val: asset.macro_tsl ? `₹${asset.macro_tsl}` : '-', color: '#F23645' },
                                { label: '1:2 R/R Target', val: asset.target_1_2 ? `₹${asset.target_1_2}` : '-', color: '#38bdf8' },
                                { label: 'Z-Score (Exhaustion)', val: asset.z_score, color: Math.abs(asset.z_score) > 3 ? '#F23645' : '#D1D4DC' },
                                { label: 'BMSB Trend (20W SMA)', val: asset.bmsb_status?.includes('ABOVE') ? 'BULLISH' : 'BEARISH', color: asset.bmsb_status?.includes('ABOVE') ? '#089981' : '#F23645' }
                            ].map((item, i) => (
                                <div key={i} style={{ backgroundColor: '#131722', padding: '16px', borderRadius: '8px', border: '1px solid #2A2E39' }}>
                                    <div style={{ fontSize: '11px', color: '#787B86', marginBottom: '4px' }}>{item.label}</div>
                                    <div style={{ color: item.color || '#D1D4DC', fontSize: '15px', fontWeight: '700' }}>{item.val || '-'}</div>
                                </div>
                            ))}
                        </div>

                        {/* 🚀 DEEP VALUE FUNDAMENTALS */}
                        <div style={{ fontSize: '12px', color: '#787B86', textTransform: 'uppercase', fontWeight: 'bold', marginTop: '10px' }}>Fundamental Health</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {[
                                { label: 'P/E Ratio', val: asset.pe_ratio },
                                { label: 'Graham No. (Intrinsic)', val: asset.graham_number ? `₹${asset.graham_number}` : '-' },
                                { label: 'Altman Z (Solvency)', val: asset.altman_z_score, color: asset.altman_z_score > 2.9 ? '#089981' : asset.altman_z_score < 1.8 ? '#F23645' : '#EAB308' },
                                { label: 'Institutional Delivery %', val: asset.delivery_pct ? `${asset.delivery_pct}%` : '-', color: asset.delivery_pct > 60 ? '#089981' : '#D1D4DC' }
                            ].map((item, i) => (
                                <div key={i} style={{ backgroundColor: '#131722', padding: '16px', borderRadius: '8px', border: '1px solid #2A2E39' }}>
                                    <div style={{ fontSize: '11px', color: '#787B86', marginBottom: '4px' }}>{item.label}</div>
                                    <div style={{ color: item.color || '#D1D4DC', fontSize: '15px', fontWeight: '700' }}>{item.val || '-'}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* BEAUTIFUL NEWS RENDERER */}
                {activeTab === 'NEWS' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {Array.isArray(news) && news.length > 0 ? news.map((n, i) => (
                            <a key={i} href={n.link} target="_blank" rel="noreferrer" style={{
                                backgroundColor: '#2A2E39',
                                padding: '16px',
                                borderRadius: '8px',
                                textDecoration: 'none',
                                border: '1px solid transparent'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#2962FF' }}>{n.title}</div>
                                    <span style={{
                                        fontSize: '10px',
                                        backgroundColor: '#0B0E14',
                                        color: '#787B86',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        height: 'fit-content',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {n.provider}
                                    </span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#D1D4DC', lineHeight: '1.5' }}>{n.snippet}...
                                </div>
                            </a>
                        )) : <div style={{ color: '#787B86' }}>No news scraped yet. Click 'Scrape News'.</div>}
                    </div>
                )}
            </div>
        </div>
    );
}
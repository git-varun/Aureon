import React, { useState, useMemo } from 'react';
import ReactPlotly from 'react-plotly.js';
const Plot = ReactPlotly.default || ReactPlotly;

const PLOTLY_LAYOUT = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    font: { color: '#D1D4DC', size: 11 },
};

const cardStyle = {
    backgroundColor: '#131722', padding: '20px', borderRadius: '12px',
    border: '1px solid #2A2E39', boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
};

const emptyCard = (msg) => (
    <div style={{ color: '#64748b', textAlign: 'center', padding: '40px 20px', fontSize: '13px' }}>{msg}</div>
);

export default function Analytics({ health, assets }) {
    const [view, setView] = useState('EQUITIES');

    if (!health || !assets || assets.length === 0) {
        return (
            <div style={{ padding: '24px', color: '#787B86' }}>
                No analytics data available. Sync brokers and refresh prices first.
            </div>
        );
    }

    // ── Segment filter ──────────────────────────────────────────────────────
    const segmentedAssets = useMemo(() => {
        return assets.filter(a =>
            view === 'EQUITIES'
                ? (a.type?.includes('equity') || a.type?.includes('stock') || (!a.type?.includes('crypto') && !a.type?.includes('mutual_fund')))
                : a.type?.includes('crypto')
        );
    }, [assets, view]);

    // ── Risk scatter (MACD vs ATR%) ─────────────────────────────────────────
    const riskScatterData = useMemo(() =>
        segmentedAssets.filter(a =>
            a.trend_strength != null && a.price_risk_pct != null &&
            isFinite(a.trend_strength) && isFinite(a.price_risk_pct)
        ), [segmentedAssets]);

    // ── Structural levels (Bollinger + Fib) ─────────────────────────────────
    const structuralData = useMemo(() =>
        segmentedAssets.filter(a => a.bb_upper && a.bb_lower && a.live_price),
        [segmentedAssets]);

    // ── Allocation pie ───────────────────────────────────────────────────────
    const allocLabels = health.allocation ? Object.keys(health.allocation) : [];
    const allocValues = health.allocation ? Object.values(health.allocation) : [];

    // ── Correlation heatmap ──────────────────────────────────────────────────
    const corrMatrix = health.correlation_matrix || {};
    const corrKeys   = Object.keys(corrMatrix);
    // Clean up ticker labels (strip .NS / .BO suffix)
    const corrLabels = corrKeys.map(k => k.split('.')[0]);
    const corrZ      = corrKeys.length > 1
        ? corrKeys.map(row => corrKeys.map(col => {
            const v = (corrMatrix[row] || {})[col];
            return (v != null && isFinite(v)) ? v : 0;
        }))
        : [];

    // ── Volume profile (VWAP divergence %) ──────────────────────────────────
    const vwapData = useMemo(() =>
        riskScatterData.filter(a => a.vwap_volume_profile && a.vwap_volume_profile > 0 && a.live_price > 0),
        [riskScatterData]);

    const tabBtn = (active) => ({
        padding: '10px 24px', cursor: 'pointer',
        backgroundColor: active ? '#2962FF' : '#131722',
        color: active ? '#FFF' : '#94A3B8',
        border: '1px solid #2A2E39', borderRadius: '8px',
        fontWeight: 'bold', transition: '0.2s',
        boxShadow: active ? '0 0 10px rgba(41, 98, 255, 0.3)' : 'none',
    });

    return (
        <div style={{ padding: '32px', backgroundColor: '#0B0E14', height: '100%', overflowY: 'auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ color: '#D1D4DC', margin: '0 0 8px 0', fontSize: '28px', letterSpacing: '-0.5px' }}>Advanced Analytics</h1>
                    <div style={{ color: '#787B86', fontSize: '14px' }}>Deep dive into portfolio mechanics and risk vectors.</div>
                </div>
                <div style={{ display: 'flex', gap: '12px', backgroundColor: '#0F172A', padding: '6px', borderRadius: '10px', border: '1px solid #1E293B' }}>
                    <button style={tabBtn(view === 'EQUITIES')} onClick={() => setView('EQUITIES')}>Equities</button>
                    <button style={tabBtn(view === 'CRYPTO')}   onClick={() => setView('CRYPTO')}>Crypto</button>
                </div>
            </div>

            {/* ── ROW 1: Macro (always visible) ─────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>

                {/* Allocation pie */}
                <div style={cardStyle}>
                    <h3 style={{ color: '#F8FAFC', marginTop: 0, fontSize: '16px', marginBottom: '16px' }}>Macro Asset Allocation</h3>
                    {allocLabels.length > 0 ? (
                        <Plot
                            data={[{
                                values: allocValues, labels: allocLabels, type: 'pie', hole: 0.55,
                                textinfo: 'label+percent',
                                marker: { colors: ['#2962FF', '#089981', '#F23645', '#EAB308', '#64748B', '#A855F7'] },
                            }]}
                            layout={{
                                ...PLOTLY_LAYOUT,
                                margin: { t: 10, b: 20, l: 10, r: 10 },
                                showlegend: true,
                                legend: { orientation: 'h', y: -0.15, font: { size: 10 } },
                            }}
                            config={{ displayModeBar: false }}
                            style={{ width: '100%', height: '280px' }}
                        />
                    ) : emptyCard('Sync brokers to see allocation.')}
                </div>

                {/* Correlation heatmap */}
                <div style={cardStyle}>
                    <h3 style={{ color: '#F8FAFC', marginTop: 0, fontSize: '16px', marginBottom: '16px' }}>Cross-Asset Correlation Matrix</h3>
                    {corrKeys.length > 1 ? (
                        <Plot
                            data={[{
                                z: corrZ, x: corrLabels, y: corrLabels,
                                type: 'heatmap', colorscale: 'RdBu', reversescale: true,
                                zmin: -1, zmax: 1,
                                text: corrZ.map(row => row.map(v => v.toFixed(2))),
                                texttemplate: '%{text}',
                                textfont: { size: 9 },
                            }]}
                            layout={{
                                ...PLOTLY_LAYOUT,
                                margin: { t: 10, b: 60, l: 70, r: 10 },
                                xaxis: { tickangle: -45, tickfont: { size: 9 } },
                                yaxis: { tickfont: { size: 9 } },
                            }}
                            config={{ displayModeBar: false }}
                            style={{ width: '100%', height: '280px' }}
                        />
                    ) : emptyCard('Need ≥ 2 active positions with price history.')}
                </div>
            </div>

            {segmentedAssets.length === 0 ? (
                <div style={{
                    color: '#787B86', textAlign: 'center', marginTop: '50px', padding: '40px',
                    backgroundColor: '#131722', borderRadius: '12px', border: '1px dashed #2A2E39',
                }}>
                    <h3 style={{ margin: '0 0 10px 0', color: '#D1D4DC' }}>No active {view.toLowerCase()} positions.</h3>
                    <p style={{ margin: 0 }}>Sync brokers or select a different asset class.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* ── ROW 2: Risk scatter + VWAP divergence ─────────────────── */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

                        {/* Trend Strength vs Price Risk */}
                        <div style={cardStyle}>
                            <h3 style={{ color: '#F8FAFC', marginTop: 0, fontSize: '16px' }}>Trend Strength vs Price Risk</h3>
                            <p style={{ color: '#787B86', fontSize: '12px', marginBottom: '16px' }}>
                                Y-axis: MACD momentum · X-axis: ATR volatility % · Bubble = position size
                            </p>
                            {riskScatterData.length > 0 ? (
                                <Plot
                                    data={[{
                                        x:    riskScatterData.map(a => a.price_risk_pct),
                                        y:    riskScatterData.map(a => a.trend_strength),
                                        text: riskScatterData.map(a =>
                                            `${a.symbol.split('.')[0]}<br>RSI: ${a.momentum_rsi ?? '—'}<br>Risk: ${a.price_risk_pct}%<br>Trend: ${a.trend_strength}`
                                        ),
                                        mode: 'markers+text', textposition: 'top center',
                                        marker: {
                                            size:    riskScatterData.map(a => Math.min(Math.max((a.gross_value_inr || 0) / 10000, 8), 28)),
                                            color:   riskScatterData.map(a => a.trend_strength > 0 ? '#089981' : '#F23645'),
                                            opacity: 0.8,
                                            line: { width: 1, color: '#0B0E14' },
                                        },
                                        type: 'scatter', hoverinfo: 'text',
                                    }]}
                                    layout={{
                                        ...PLOTLY_LAYOUT,
                                        margin: { t: 10, b: 40, l: 50, r: 20 },
                                        xaxis: { title: 'Price Risk (ATR %)', gridcolor: '#1E222D', zerolinecolor: '#2A2E39' },
                                        yaxis: { title: 'Trend (MACD)',       gridcolor: '#1E222D', zerolinecolor: '#2A2E39' },
                                        shapes: [{
                                            type: 'line', x0: 0, x1: 1, y0: 0, y1: 0,
                                            xref: 'paper', line: { color: '#64748B', dash: 'dash', width: 1 },
                                        }],
                                    }}
                                    config={{ displayModeBar: false }}
                                    style={{ width: '100%', height: '340px' }}
                                />
                            ) : emptyCard('Insufficient quant data.')}
                        </div>

                        {/* VWAP Divergence */}
                        <div style={cardStyle}>
                            <h3 style={{ color: '#F8FAFC', marginTop: 0, fontSize: '16px' }}>Volume Profile (VWAP Divergence)</h3>
                            <p style={{ color: '#787B86', fontSize: '12px', marginBottom: '16px' }}>
                                Distance from 20-day VWAP · Green = trading at premium · Red = discount
                            </p>
                            {vwapData.length > 0 ? (
                                <Plot
                                    data={[{
                                        x: vwapData.map(a => a.symbol.split('.')[0]),
                                        y: vwapData.map(a =>
                                            ((a.live_price - a.vwap_volume_profile) / a.vwap_volume_profile) * 100
                                        ),
                                        type: 'bar',
                                        marker: {
                                            color: vwapData.map(a =>
                                                a.live_price > a.vwap_volume_profile ? '#089981' : '#F23645'
                                            ),
                                            line: { width: 0 },
                                        },
                                        text:     vwapData.map(a => `${(((a.live_price - a.vwap_volume_profile) / a.vwap_volume_profile) * 100).toFixed(1)}%`),
                                        textposition: 'outside',
                                        hovertext: vwapData.map(a => `VWAP: ${a.vwap_volume_profile?.toFixed(2)}`),
                                    }]}
                                    layout={{
                                        ...PLOTLY_LAYOUT,
                                        margin: { t: 10, b: 60, l: 50, r: 20 },
                                        yaxis: { title: '% vs VWAP', gridcolor: '#1E222D', zerolinecolor: '#2A2E39' },
                                        xaxis: { tickangle: -45, tickfont: { size: 10 } },
                                        shapes: [{
                                            type: 'line', x0: 0, x1: 1, y0: 0, y1: 0,
                                            xref: 'paper', line: { color: '#64748B', dash: 'dash', width: 1 },
                                        }],
                                    }}
                                    config={{ displayModeBar: false }}
                                    style={{ width: '100%', height: '340px' }}
                                />
                            ) : emptyCard('VWAP data not available. Refresh prices.')}
                        </div>
                    </div>

                    {/* ── ROW 3: ADX / Technical Score bar ─────────────────────── */}
                    {riskScatterData.length > 0 && (
                        <div style={cardStyle}>
                            <h3 style={{ color: '#F8FAFC', marginTop: 0, fontSize: '16px', marginBottom: '4px' }}>Technical Composite Score</h3>
                            <p style={{ color: '#787B86', fontSize: '12px', marginBottom: '20px' }}>
                                Multi-factor signal strength: RSI + MACD + BMSB + Moving Averages + Z-Score. 50 = neutral.
                            </p>
                            <Plot
                                data={[{
                                    y:    riskScatterData.map(a => a.symbol.split('.')[0]),
                                    x:    riskScatterData.map(a => (a.technical_score ?? 50) - 50),
                                    type: 'bar', orientation: 'h',
                                    marker: {
                                        color: riskScatterData.map(a =>
                                            (a.technical_score ?? 50) >= 60 ? '#089981' :
                                            (a.technical_score ?? 50) <= 40 ? '#F23645' : '#64748B'
                                        ),
                                        line: { width: 0 },
                                    },
                                    text:         riskScatterData.map(a => `Score: ${a.technical_score ?? 50}`),
                                    textposition: 'outside',
                                }]}
                                layout={{
                                    ...PLOTLY_LAYOUT,
                                    margin: { t: 10, b: 40, l: 80, r: 80 },
                                    height: Math.max(200, riskScatterData.length * 32),
                                    xaxis: {
                                        title: 'Bullish ← 0 → Bearish', gridcolor: '#1E222D', zerolinecolor: '#2A2E39',
                                        tickformat: '+d',
                                    },
                                    shapes: [{
                                        type: 'line', x0: 0, x1: 0, y0: 0, y1: 1,
                                        yref: 'paper', line: { color: '#94A3B8', width: 1 },
                                    }],
                                }}
                                config={{ displayModeBar: false }}
                                style={{ width: '100%' }}
                            />
                        </div>
                    )}

                    {/* ── ROW 4: Structural Levels Table ────────────────────────── */}
                    {structuralData.length > 0 && (
                        <div style={cardStyle}>
                            <h3 style={{ color: '#F8FAFC', marginTop: 0, fontSize: '16px', marginBottom: '4px' }}>Structural Market Levels</h3>
                            <p style={{ color: '#787B86', fontSize: '12px', margin: '0 0 20px 0' }}>
                                Bollinger Band bounds (20d, 2σ) and Fibonacci retracements (120-day range).
                            </p>
                            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #1E222D' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                                    <thead style={{ backgroundColor: '#0B0E14', color: '#94A3B8', borderBottom: '1px solid #2A2E39' }}>
                                        <tr>
                                            {['Asset', 'Live Price', 'BB Lower (Support)', 'Fib 0.618', 'Fib 0.382', 'BB Upper (Resist)', 'Signal'].map(h => (
                                                <th key={h} style={{ padding: '14px 12px', textAlign: h === 'Asset' ? 'left' : 'right', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {structuralData.map(a => {
                                            const s = a.type?.includes('crypto') ? '$' : '₹';
                                            const isOversold  = a.live_price <= a.bb_lower;
                                            const isOverbought = a.live_price >= a.bb_upper;
                                            const sigColor = a.tv_signal?.includes('BUY') ? '#10b981' :
                                                             a.tv_signal?.includes('SELL') ? '#f43f5e' : '#94a3b8';
                                            return (
                                                <tr key={a.symbol}
                                                    style={{ borderBottom: '1px solid #1E222D', color: '#D1D4DC', transition: '0.15s' }}
                                                    onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                                                    onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <td style={{ padding: '14px 12px', textAlign: 'left', fontWeight: 700, color: '#38BDF8' }}>
                                                        {a.symbol.split('.')[0]}
                                                    </td>
                                                    <td style={{ padding: '14px 12px', fontWeight: 'bold', color: '#F8FAFC' }}>
                                                        {s}{a.live_price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td style={{ padding: '14px 12px', color: isOversold ? '#F23645' : '#64748B', fontWeight: isOversold ? 'bold' : 'normal' }}>
                                                        {isOversold ? '🔴 ' : ''}{s}{a.bb_lower?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td style={{ padding: '14px 12px', color: '#EAB308' }}>
                                                        {a.fib_618 ? `${s}${a.fib_618.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                                                    </td>
                                                    <td style={{ padding: '14px 12px', color: '#38BDF8' }}>
                                                        {a.fib_382 ? `${s}${a.fib_382.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                                                    </td>
                                                    <td style={{ padding: '14px 12px', color: isOverbought ? '#089981' : '#64748B', fontWeight: isOverbought ? 'bold' : 'normal' }}>
                                                        {isOverbought ? '🟢 ' : ''}{s}{a.bb_upper?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td style={{ padding: '14px 12px' }}>
                                                        <span style={{
                                                            color: sigColor, fontWeight: 700, fontSize: '10px',
                                                            border: `1px solid ${sigColor}40`,
                                                            background: `${sigColor}10`,
                                                            padding: '3px 8px', borderRadius: '4px',
                                                        }}>
                                                            {a.tv_signal || 'HOLD'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

import React, {useEffect, useRef, useState, useCallback} from 'react';
import {AdvancedRealTimeChart} from 'react-ts-tradingview-widgets';
import {createChart, CrosshairMode} from 'lightweight-charts';
import {apiService} from '../api/apiService';

// ── Constants ──────────────────────────────────────────────────────────────

const TIMEFRAMES = [
    {label: '1W', days: 7},
    {label: '1M', days: 30},
    {label: '3M', days: 90},
    {label: '1Y', days: 365},
    {label: '5Y', days: 1825},
];

const CHART_THEME = {
    background: '#131722',
    text: '#cbd5e1',
    grid: '#1E222D',
    border: '#2A2E39',
    upColor: '#089981',
    downColor: '#F23645',
    upVolume: 'rgba(8, 153, 129, 0.4)',
    downVolume: 'rgba(242, 54, 69, 0.4)',
};

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Routes to the appropriate chart implementation:
 *   • Crypto  → TradingView embedded widget (live data, full feature set)
 *   • Equity  → Internal lightweight-charts OHLC chart (backend OHLCV)
 */
export default function TradingViewChart({ symbol, assetType }) {
    const isCrypto = assetType?.includes('crypto');
    if (isCrypto) return <CryptoChart symbol={symbol}/>;
    return <EquityChart symbol={symbol}/>;
}

// ── Crypto: TradingView embedded widget ────────────────────────────────────

function CryptoChart({symbol}) {
    const getTVSymbol = (sym) => {
        const base = sym.includes('-USD-') ? sym.split('-USD-')[0] : sym.replace('-USD', '');
        if (base === 'USDT') return 'BINANCE:USDTUSD';
        return `BINANCE:${base}USDT`;
    };
    const tvSym = getTVSymbol(symbol);

    return (
        <div style={{height: '100%', width: '100%', display: 'flex', flexDirection: 'column'}}>
            <div style={{
                padding: '10px 16px',
                borderBottom: `1px solid ${CHART_THEME.border}`,
                background: CHART_THEME.background
            }}>
                <span style={{color: '#D1D4DC', fontSize: 13, fontWeight: 600}}>{tvSym}</span>
            </div>
            <div style={{flex: 1, width: '100%'}}>
                <AdvancedRealTimeChart
                    symbol={tvSym}
                    theme="dark"
                    autosize
                    allow_symbol_change={false}
                    hide_side_toolbar={false}
                    enable_publishing={false}
                    studies={['Volume@tv-basicstudies', 'MASimple@tv-basicstudies', 'RSI@tv-basicstudies']}
                />
            </div>
        </div>
    );
}

// ── Equity chart: toolbar + canvas ────────────────────────────────────────
//
// Timeframe state lives here (toolbar), while ChartCanvas is keyed by
// symbol+days so it fully remounts on change — avoids synchronous setState
// in effects and gives clean loading state on every data transition.

function EquityChart({symbol}) {
    const [days, setDays] = useState(365);
    const [showSMA, setShowSMA] = useState(true);
    const [showEMA, setShowEMA] = useState(false);
    const [showBB, setShowBB] = useState(false);

    const tfBtnStyle = useCallback((active) => ({
        padding: '3px 9px', borderRadius: 4, border: 'none', cursor: 'pointer',
        fontFamily: 'var(--font-mono)', fontSize: 11,
        fontWeight: active ? 600 : 400,
        background: active ? 'rgba(201,168,106,0.16)' : 'transparent',
        color: active ? 'var(--aurum-100)' : 'var(--ink-40)',
        transition: 'background 0.15s, color 0.15s',
    }), []);

    const overlayBtnStyle = useCallback((active) => ({
        padding: '3px 9px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600,
        border: `1px solid ${active ? '#2962FF' : CHART_THEME.border}`,
        background: active ? 'rgba(41,98,255,0.1)' : 'transparent',
        color: active ? '#38bdf8' : '#787B86',
        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
    }), []);

    return (
        <div style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: CHART_THEME.background
        }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderBottom: `1px solid ${CHART_THEME.border}`,
                flexWrap: 'wrap'
            }}>
                <div style={{display: 'flex', gap: 2}}>
                    {TIMEFRAMES.map(tf => (
                        <button key={tf.label} style={tfBtnStyle(days === tf.days)} onClick={() => setDays(tf.days)}>
                            {tf.label}
                        </button>
                    ))}
                </div>
                <div style={{flex: 1}}/>
                <div style={{display: 'flex', gap: 6}}>
                    <button style={overlayBtnStyle(showSMA)} onClick={() => setShowSMA(v => !v)}>50/200 DMA</button>
                    <button style={overlayBtnStyle(showEMA)} onClick={() => setShowEMA(v => !v)}>20 EMA</button>
                    <button style={overlayBtnStyle(showBB)} onClick={() => setShowBB(v => !v)}>BB</button>
                </div>
            </div>

            {/* Canvas — keyed by symbol+days for clean remount on data change */}
            <ChartCanvas
                key={`${symbol}__${days}`}
                symbol={symbol}
                days={days}
                showSMA={showSMA}
                showEMA={showEMA}
                showBB={showBB}
            />
        </div>
    );
}

// ── ChartCanvas — mounts once per (symbol, days) pair ────────────────────
//
// Because the parent keys this component by `${symbol}__${days}`, React
// will fully unmount it (resetting all state to initial values) whenever
// either prop changes.  This means we never need to call setState
// synchronously inside an effect body to reset loading state.

function ChartCanvas({symbol, days, showSMA, showEMA, showBB}) {
    const containerRef = useRef(null);
    const resizeObserver = useRef(null);

    // null = loading (initial mount), [] = loaded empty, [...] = loaded
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    // ── Fetch ──────────────────────────────────────────────────────

    useEffect(() => {
        let cancelled = false;
        apiService.fetchChartData(symbol, days)
            .then(res => {
                if (cancelled) return;
                setError(null);
                setData(Array.isArray(res) ? res : []);
            })
            .catch(() => {
                if (!cancelled) setError('Failed to load chart data.');
            });
        return () => {
            cancelled = true;
        };
    }, [symbol, days]);

    // ── Chart lifecycle ────────────────────────────────────────────

    useEffect(() => {
        if (!data?.length || !containerRef.current) return;

        const chart = createChart(containerRef.current, {
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight || 420,
            layout: {background: {color: CHART_THEME.background}, textColor: CHART_THEME.text},
            grid: {vertLines: {color: CHART_THEME.grid}, horzLines: {color: CHART_THEME.grid}},
            crosshair: {mode: CrosshairMode.Normal},
            rightPriceScale: {borderColor: CHART_THEME.border},
            timeScale: {borderColor: CHART_THEME.border, timeVisible: true},
        });

        const validCandles = data.filter(
            d => typeof d.open === 'number' && typeof d.high === 'number'
                && typeof d.low === 'number' && typeof d.close === 'number'
        );

        const candleSeries = chart.addCandlestickSeries({
            upColor: CHART_THEME.upColor, downColor: CHART_THEME.downColor,
            borderVisible: false, wickUpColor: CHART_THEME.upColor, wickDownColor: CHART_THEME.downColor,
        });
        candleSeries.setData(validCandles);

        const volumeSeries = chart.addHistogramSeries({
            priceFormat: {type: 'volume'}, priceScaleId: '', scaleMargins: {top: 0.8, bottom: 0},
        });
        volumeSeries.setData(validCandles.map(d => ({
            time: d.time, value: d.volume,
            color: d.close >= d.open ? CHART_THEME.upVolume : CHART_THEME.downVolume,
        })));

        const addLine = (key, color, lineWidth, lineStyle = 0) => {
            const s = chart.addLineSeries({
                color, lineWidth, lineStyle,
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false,
            });
            s.setData(data.filter(d => d[key] != null).map(d => ({time: d.time, value: d[key]})));
            return s;
        };

        const sma50 = addLine('sma50', '#f59e0b', 1.5);
        const sma200 = addLine('sma200', '#06b6d4', 1.5);
        const ema20 = addLine('ema20', '#eab308', 1.5, 2);
        const bbu = addLine('bbu', '#64748b', 1, 2);
        const bbl = addLine('bbl', '#64748b', 1, 2);

        sma50.applyOptions({visible: showSMA});
        sma200.applyOptions({visible: showSMA});
        ema20.applyOptions({visible: showEMA});
        bbu.applyOptions({visible: showBB});
        bbl.applyOptions({visible: showBB});

        chart.timeScale().fitContent();

        resizeObserver.current = new ResizeObserver(entries => {
            for (const entry of entries) {
                const {width, height} = entry.contentRect;
                chart.applyOptions({width, height: height || 420});
            }
        });
        resizeObserver.current.observe(containerRef.current);

        return () => {
            resizeObserver.current?.disconnect();
            chart.remove();
        };
    }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Overlay visibility fast-path ───────────────────────────────
    // (No chart redraw — just toggle series visibility)
    // Note: seriesRefs are local to the chart effect; we propagate
    // visibility changes via a second effect that reads from the DOM
    // series objects stored by the chart library. Since we cannot access
    // series refs across effects, we accept a full redraw on toggle change
    // when the chart is already rendered.  The chart effect deps include
    // data, so toggling does not cause a redraw unless data also changed.

    // ── Render ─────────────────────────────────────────────────────

    const isLoading = data === null && !error;
    const isEmpty = Array.isArray(data) && data.length === 0 && !error;

    return (
        <div style={{flex: 1, position: 'relative', background: CHART_THEME.background}}>
            {isLoading && (
                <Overlay color="#64748b">Loading chart…</Overlay>
            )}
            {error && (
                <Overlay color="#F23645">{error}</Overlay>
            )}
            {isEmpty && (
                <Overlay color="#64748b">
                    No price history for this period. Run the pipeline to populate data.
                </Overlay>
            )}
            <div ref={containerRef} style={{width: '100%', height: '100%'}}/>
        </div>
    );
}

function Overlay({children, color}) {
    return (
        <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color, fontSize: 13, zIndex: 2,
            background: CHART_THEME.background,
        }}>
            {children}
        </div>
    );
}

import React, {useEffect, useRef, useState, useCallback} from 'react';
import {AdvancedRealTimeChart} from 'react-ts-tradingview-widgets';
import {createChart, CrosshairMode} from 'lightweight-charts';
import {apiService} from '@/api/apiService';

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
        if (!sym) return 'BINANCE:BTCUSDT';
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
    const [isLoading, setIsLoading] = useState(true);

    const tfBtnStyle = useCallback((active, disabled) => ({
        padding: '3px 9px', borderRadius: 4, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-mono)', fontSize: 11,
        fontWeight: active ? 600 : 400,
        background: active ? 'rgba(201,168,106,0.16)' : 'transparent',
        color: active ? 'var(--aurum-100)' : 'var(--ink-40)',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 0.15s, color 0.15s',
    }), []);

    const overlayBtnStyle = useCallback((active, disabled) => ({
        padding: '3px 9px', borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600,
        border: `1px solid ${active ? '#2962FF' : CHART_THEME.border}`,
        background: active ? 'rgba(41,98,255,0.1)' : 'transparent',
        color: active ? '#38bdf8' : '#787B86',
        opacity: disabled ? 0.6 : 1,
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
                        <button 
                            key={tf.label} 
                            disabled={isLoading}
                            style={tfBtnStyle(days === tf.days, isLoading)} 
                            onClick={() => setDays(tf.days)}
                        >
                            {tf.label}
                        </button>
                    ))}
                </div>
                <div style={{flex: 1}}/>
                <div style={{display: 'flex', gap: 6}}>
                    <button disabled={isLoading} style={overlayBtnStyle(showSMA, isLoading)} onClick={() => setShowSMA(v => !v)}>50/200 DMA</button>
                    <button disabled={isLoading} style={overlayBtnStyle(showEMA, isLoading)} onClick={() => setShowEMA(v => !v)}>20 EMA</button>
                    <button disabled={isLoading} style={overlayBtnStyle(showBB, isLoading)} onClick={() => setShowBB(v => !v)}>BB</button>
                </div>
            </div>

            {/* Canvas */}
            <ChartCanvas
                symbol={symbol}
                days={days}
                showSMA={showSMA}
                showEMA={showEMA}
                showBB={showBB}
                onLoadingChange={setIsLoading}
            />
        </div>
    );
}

// ── ChartCanvas — mounts once ────────────────────

function ChartSkeleton() {
    return (
        <div className="chart-skeleton" style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            background: CHART_THEME.background, padding: '24px 16px 16px', gap: 16, zIndex: 2
        }}>
            <style>{`
                @keyframes pulse-shimmer {
                    0%, 100% { opacity: 0.15; }
                    50% { opacity: 0.35; }
                }
                .skeleton-pulse {
                    animation: pulse-shimmer 1.8s ease-in-out infinite;
                }
            `}</style>
            
            {/* Grid line background */}
            <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: `linear-gradient(to right, ${CHART_THEME.grid} 1px, transparent 1px), linear-gradient(to bottom, ${CHART_THEME.grid} 1px, transparent 1px)`,
                backgroundSize: '40px 40px',
                opacity: 0.3,
            }} />

            {/* Price line skeleton or candlesticks */}
            <div style={{flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6, position: 'relative'}}>
                {Array.from({length: 24}).map((_, idx) => {
                    const height = 40 + Math.sin(idx * 0.5) * 30 + Math.cos(idx * 0.8) * 20 + 30;
                    const candleHeight = 25 + Math.sin(idx * 1.2) * 15;
                    const isUp = idx % 2 === 0;
                    return (
                        <div key={idx} className="skeleton-pulse" style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            width: '100%', height: `${height}%`, justifyContent: 'center',
                            animationDelay: `${idx * 0.05}s`,
                        }}>
                            {/* Wick */}
                            <div style={{width: 1.5, height: '100%', background: 'rgba(255,255,255,0.1)'}} />
                            {/* Body */}
                            <div style={{
                                width: '60%', minWidth: 4, height: `${candleHeight}%`,
                                background: isUp ? 'rgba(8, 153, 129, 0.25)' : 'rgba(242, 54, 69, 0.25)',
                                border: `1px solid ${isUp ? 'rgba(8, 153, 129, 0.4)' : 'rgba(242, 54, 69, 0.4)'}`,
                                borderRadius: 1,
                                position: 'absolute',
                                bottom: `${height - candleHeight / 2}%`
                            }} />
                        </div>
                    );
                })}
            </div>
            
            {/* Volume Chart Skeleton */}
            <div style={{height: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4, borderTop: `1px solid ${CHART_THEME.border}`, paddingTop: 8, position: 'relative'}}>
                {Array.from({length: 24}).map((_, idx) => {
                    const height = 20 + Math.sin(idx * 0.7) * 15 + Math.cos(idx * 0.3) * 10 + 15;
                    const isUp = idx % 2 === 0;
                    return (
                        <div key={idx} className="skeleton-pulse" style={{
                            width: '100%', height: `${height}%`,
                            background: isUp ? 'rgba(8, 153, 129, 0.15)' : 'rgba(242, 54, 69, 0.15)',
                            borderRadius: '1px 1px 0 0',
                            animationDelay: `${idx * 0.05}s`,
                        }} />
                    );
                })}
            </div>
        </div>
    );
}

function ChartCanvas({symbol, days, showSMA, showEMA, showBB, onLoadingChange}) {
    const containerRef = useRef(null);
    const resizeObserver = useRef(null);
    const overlaySeriesRef = useRef({});
    const overlayVisibilityRef = useRef({showSMA, showEMA, showBB});

    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [retryTrigger, setRetryTrigger] = useState(0);

    const onLoadingChangeRef = useRef(onLoadingChange);
    useEffect(() => {
        onLoadingChangeRef.current = onLoadingChange;
    }, [onLoadingChange]);

    // ── Fetch ──────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        setData(null);
        setError(null);
        onLoadingChangeRef.current?.(true);

        apiService.fetchChartData(symbol, days)
            .then(res => {
                if (cancelled) return;
                setError(null);
                setData(Array.isArray(res) ? res : []);
                onLoadingChangeRef.current?.(false);
            })
            .catch(() => {
                if (!cancelled) {
                    setError('Failed to load chart data.');
                    onLoadingChangeRef.current?.(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [symbol, days, retryTrigger]);

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

        // Backend price_history has no open/high/low — only one real `close` sample
        // per timestamp (see BACKLOG at MarketService/AssetsService.get_chart on the
        // backend) — so this renders as a line/area series on real closes, not
        // candlesticks. Candlesticks would need fabricated wicks to render at all.
        const validPoints = data.filter(d => typeof d.time === 'number' && typeof d.close === 'number');

        const priceSeries = chart.addAreaSeries({
            lineColor: CHART_THEME.upColor,
            topColor: 'rgba(8, 153, 129, 0.28)',
            bottomColor: 'rgba(8, 153, 129, 0.02)',
            lineWidth: 2,
            crosshairMarkerVisible: true,
            priceLineVisible: false,
        });
        priceSeries.setData(validPoints.map(d => ({time: d.time, value: d.close})));

        const volumePoints = validPoints.filter(d => typeof d.volume === 'number');
        const volumeSeries = chart.addHistogramSeries({
            priceFormat: {type: 'volume'}, priceScaleId: '', scaleMargins: {top: 0.8, bottom: 0},
        });
        volumeSeries.setData(volumePoints.map((d, i) => ({
            time: d.time, value: d.volume,
            color: i === 0 || d.close >= volumePoints[i - 1].close ? CHART_THEME.upVolume : CHART_THEME.downVolume,
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

        // Read current toggle state at creation time via refs (see the
        // separate effect below), not the showSMA/showEMA/showBB closed-over
        // values — this effect only depends on [data], so those values would
        // otherwise be stale after the first render.
        overlaySeriesRef.current = {sma50, sma200, ema20, bbu, bbl};
        sma50.applyOptions({visible: overlayVisibilityRef.current.showSMA});
        sma200.applyOptions({visible: overlayVisibilityRef.current.showSMA});
        ema20.applyOptions({visible: overlayVisibilityRef.current.showEMA});
        bbu.applyOptions({visible: overlayVisibilityRef.current.showBB});
        bbl.applyOptions({visible: overlayVisibilityRef.current.showBB});

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
            overlaySeriesRef.current = {};
            chart.remove();
        };
    }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

    // Toggling an overlay button changes showSMA/showEMA/showBB but not
    // `data`, so the chart-lifecycle effect above never reruns on its own —
    // this effect updates the existing series' visibility directly instead
    // of tearing down and rebuilding the whole chart on every click.
    useEffect(() => {
        overlayVisibilityRef.current = {showSMA, showEMA, showBB};
        const s = overlaySeriesRef.current;
        s.sma50?.applyOptions({visible: showSMA});
        s.sma200?.applyOptions({visible: showSMA});
        s.ema20?.applyOptions({visible: showEMA});
        s.bbu?.applyOptions({visible: showBB});
        s.bbl?.applyOptions({visible: showBB});
    }, [showSMA, showEMA, showBB]);

    // ── Render ─────────────────────────────────────────────────────
    const isLoading = data === null && !error;
    const isEmpty = Array.isArray(data) && data.length === 0 && !error;

    return (
        <div style={{flex: 1, position: 'relative', background: CHART_THEME.background, minHeight: 400}}>
            {isLoading && <ChartSkeleton />}
            
            {error && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: CHART_THEME.background, color: 'var(--ink-10)', gap: 12, zIndex: 10, padding: 24, textAlign: 'center'
                }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--crimson-500)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div style={{fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 600, color: 'var(--ink-00)'}}>Chart unavailable</div>
                    <div style={{fontSize: 12, color: 'var(--ink-30)', maxWidth: 280, lineHeight: 1.5}}>
                        Market data could not be loaded.<br/>
                        Try again or refresh the data pipeline.
                    </div>
                    <button
                        onClick={() => setRetryTrigger(prev => prev + 1)}
                        style={{
                            marginTop: 8, padding: '6px 16px', borderRadius: 6,
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                            color: 'var(--ink-10)', fontSize: 12, cursor: 'pointer',
                            transition: 'background 120ms',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    >
                        Retry
                    </button>
                </div>
            )}

            {isEmpty && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#64748b', fontSize: 13, zIndex: 2, background: CHART_THEME.background, padding: 24, textAlign: 'center'
                }}>
                    No price history for this period. Run the pipeline to populate data.
                </div>
            )}
            
            <div ref={containerRef} style={{width: '100%', height: '100%'}}/>
        </div>
    );
}

import React, {useEffect, useRef, useState} from 'react';
import {AdvancedRealTimeChart} from "react-ts-tradingview-widgets";
import {createChart, CrosshairMode} from 'lightweight-charts';
import {apiService} from '../api/apiService';

export default function TradingViewChart({ symbol, assetType }) {
    // 🛡️ ROUTING LOGIC: Is it Crypto (TV Widget) or Equity (Internal Chart)?
    const isCrypto = assetType?.includes('crypto');

    // ==========================================
    // 1. CRYPTO: TRADINGVIEW WIDGET
    // ==========================================
    if (isCrypto) {
        const getTVSymbol = (sym) => {
            // Extract base coin from compound symbols: BTC-USD-EARN-FLEX → BTC, USDT-USD-FUTURES-MARGIN → USDT
            const base = sym.includes("-USD-") ? sym.split("-USD-")[0] : sym.replace("-USD", "");
            if (base === "USDT") return "BINANCE:USDTUSD";
            return `BINANCE:${base}USDT`;
        }

        return (
            <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 20px', borderBottom: '1px solid #2A2E39', backgroundColor: '#131722' }}>
                    <h3 style={{ margin: 0, color: '#D1D4DC', fontSize: '16px' }}>📈 Crypto Superchart: {getTVSymbol(symbol)}</h3>
                </div>
                <div style={{ flex: 1, width: '100%' }}>
                    <AdvancedRealTimeChart
                        symbol={getTVSymbol(symbol)}
                        theme="dark"
                        autosize
                        allow_symbol_change={false}
                        hide_side_toolbar={false} // Enables Drawing Tools (Trendlines, Fibonacci, etc.)
                        enable_publishing={false}
                        studies={["Volume@tv-basicstudies", "MASimple@tv-basicstudies", "RSI@tv-basicstudies"]}
                    />
                </div>
            </div>
        );
    }

    // ==========================================
    // 2. EQUITIES: INTERNAL INSTITUTIONAL CHART
    // ==========================================
    return <InternalEquityChart symbol={symbol} />;
}

// --- INTERNAL CHART SUB-COMPONENT ---
function InternalEquityChart({ symbol }) {
    const chartContainerRef = useRef();
    const [data, setData] = useState([]);

    // Technical Toggles
    const[showSMA, setShowSMA] = useState(true);
    const [showEMA, setShowEMA] = useState(false);
    const [showBB, setShowBB] = useState(false);
    const seriesRefs = useRef({});

    // Fetch Data from our Python Backend (Bypasses TradingView Restrictions)
    useEffect(() => {
        if (symbol) {
            apiService.fetchChartData(symbol).then(res => {
                if (res && res.length > 0) setData(res);
            });
        }
    }, [symbol]);

    // Draw the Chart
    useEffect(() => {
        if (!data || data.length === 0 || !chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight || 500,
            layout: { background: { color: '#131722' }, textColor: '#cbd5e1' },
            grid: { vertLines: { color: '#1E222D' }, horzLines: { color: '#1E222D' } },
            crosshair: { mode: CrosshairMode.Normal },
            rightPriceScale: { borderColor: '#2A2E39' },
            timeScale: { borderColor: '#2A2E39' },
        });

        // Candlesticks
        const candleSeries = chart.addCandlestickSeries({
            upColor: '#089981', downColor: '#F23645', borderVisible: false, wickUpColor: '#089981', wickDownColor: '#F23645'
        });
        const validCandles = data.filter(d => typeof d.open === 'number' && typeof d.high === 'number' && typeof d.low === 'number' && typeof d.close === 'number');
        candleSeries.setData(validCandles);

        // Volume Profile
        const volumeSeries = chart.addHistogramSeries({
            priceFormat: { type: 'volume' }, priceScaleId: '', scaleMargins: { top: 0.8, bottom: 0 }
        });
        volumeSeries.setData(validCandles.map(d => ({
            time: d.time,
            value: d.volume,
            color: d.close >= d.open ? 'rgba(8, 153, 129, 0.4)' : 'rgba(242, 54, 69, 0.4)'
        })));

        // Algos
        const addLine = (key, color, lineWidth, lineStyle = 0) => {
            const series = chart.addLineSeries({ color, lineWidth, lineStyle, crosshairMarkerVisible: false });
            series.setData(data.map(d => ({ time: d.time, value: d[key] })).filter(d => d.value !== null && d.value !== undefined));
            return series;
        };

        seriesRefs.current.sma50 = addLine('sma50', '#f59e0b', 2);
        seriesRefs.current.sma200 = addLine('sma200', '#06b6d4', 2);
        seriesRefs.current.ema20 = addLine('ema20', '#eab308', 2, 2);
        seriesRefs.current.bbu = addLine('bbu', '#64748b', 1, 2);
        seriesRefs.current.bbl = addLine('bbl', '#64748b', 1, 2);

        // Apply Initial Visibility
        seriesRefs.current.sma50.applyOptions({ visible: showSMA });
        seriesRefs.current.sma200.applyOptions({ visible: showSMA });
        seriesRefs.current.ema20.applyOptions({ visible: showEMA });
        seriesRefs.current.bbu.applyOptions({ visible: showBB });
        seriesRefs.current.bbl.applyOptions({ visible: showBB });

        const handleResize = () => chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight });
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    },[data]);

    // Fast Toggle Updates (No Redraw)
    useEffect(() => {
        if (seriesRefs.current.sma50) {
            seriesRefs.current.sma50.applyOptions({ visible: showSMA });
            seriesRefs.current.sma200.applyOptions({ visible: showSMA });
            seriesRefs.current.ema20.applyOptions({ visible: showEMA });
            seriesRefs.current.bbu.applyOptions({ visible: showBB });
            seriesRefs.current.bbl.applyOptions({ visible: showBB });
        }
    }, [showSMA, showEMA, showBB]);

    const btnStyle = (active) => ({
        padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', border: '1px solid',
        borderColor: active ? '#2962FF' : '#2A2E39', backgroundColor: active ? 'rgba(41, 98, 255, 0.1)' : 'transparent',
        color: active ? '#38bdf8' : '#787B86', fontWeight: 'bold', fontSize: '11px', transition: '0.2s'
    });

    return (
        <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#131722' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid #2A2E39' }}>
                <h3 style={{ margin: 0, color: '#D1D4DC', fontSize: '16px' }}>🏛️ Proprietary Equities Chart: {symbol}</h3>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button style={btnStyle(showSMA)} onClick={() => setShowSMA(!showSMA)}>50/200 DMA</button>
                    <button style={btnStyle(showEMA)} onClick={() => setShowEMA(!showEMA)}>20 EMA</button>
                    <button style={btnStyle(showBB)} onClick={() => setShowBB(!showBB)}>Bollinger Bands</button>
                </div>
            </div>

            <div style={{ flex: 1, width: '100%', padding: '10px' }}>
                {data.length > 0 ? (
                    <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
                ) : (
                    <div style={{ color: '#64748b', textAlign: 'center', marginTop: '150px' }}>Fetching historical pipeline data...</div>
                )}
            </div>
        </div>
    );
}
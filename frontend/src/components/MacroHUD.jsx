import React, { useState, useEffect } from 'react';
import { Clock, Globe, PanelLeftClose, PanelRightClose } from 'lucide-react';

export default function MacroHUD({ state, toggleLeft, toggleRight }) {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const isMarketOpen = () => {
        const day = currentTime.getDay();
        const timeInMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
        // NSE: Mon–Fri, 09:15–15:30 IST
        return day >= 1 && day <= 5 && timeInMinutes >= 555 && timeInMinutes <= 930;
    };

    const sectionStyle = {
        padding: '0 20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
        height: '100%',
    };

    const labelStyle = {
        fontSize: '10px', color: '#787B86', textTransform: 'uppercase',
        letterSpacing: '0.5px', marginBottom: '2px', fontWeight: 'bold',
    };
    const valStyle = { fontSize: '15px', fontWeight: '800', color: '#F8FAFC' };

    const iconBtnStyle = {
        padding: '6px', backgroundColor: 'transparent', border: 'none',
        cursor: 'pointer', display: 'flex', alignItems: 'center',
    };

    return (
        <div style={{
            display: 'flex',
            height: '64px',
            backgroundColor: '#0B0E14',
            borderBottom: '1px solid #1E222D',
            alignItems: 'center',
            padding: '0 10px 0 0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
            {/* 1. Sidebar Toggles */}
            <div style={{ ...sectionStyle, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                <button onClick={toggleLeft} style={iconBtnStyle} title="Toggle Watchlist">
                    <PanelLeftClose size={18} color="#787B86" />
                </button>
                <button onClick={toggleRight} style={iconBtnStyle} title="Toggle Deep Dive">
                    <PanelRightClose size={18} color="#787B86" />
                </button>
            </div>

            {/* 2. Clock & Market Status */}
            <div style={{ ...sectionStyle, minWidth: '150px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#787B86', fontSize: '11px', fontWeight: 'bold' }}>
                    <Clock size={12} /> {currentTime.toLocaleTimeString('en-IN', { hour12: true })}
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px',
                    fontSize: '12px', fontWeight: '800',
                    color: isMarketOpen() ? '#089981' : '#F23645',
                }}>
                    <div style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        backgroundColor: isMarketOpen() ? '#089981' : '#F23645',
                        boxShadow: `0 0 8px ${isMarketOpen() ? '#089981' : '#F23645'}`,
                    }} />
                    {isMarketOpen() ? 'NSE LIVE' : 'MARKETS CLOSED'}
                </div>
            </div>

            {/* 3. Total Net Worth */}
            <div style={sectionStyle}>
                <div style={labelStyle}>Total Net Worth</div>
                <div style={{ ...valStyle, color: '#38bdf8' }}>
                    ₹{state.total_value_inr?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </div>
            </div>

            {/* 4. Portfolio Beta */}
            <div style={sectionStyle}>
                <div style={labelStyle}>Portfolio Beta</div>
                <div style={{ ...valStyle, color: state.health?.beta > 1.2 ? '#F23645' : '#089981' }}>
                    {state.health?.beta?.toFixed(2)}{' '}
                    <span style={{ fontSize: '10px', color: '#787B86', fontWeight: 'normal' }}>vs NIFTY</span>
                </div>
            </div>

            {/* 5. Global Sentiment */}
            <div style={sectionStyle}>
                <div style={labelStyle}>Global Sentiment</div>
                <div style={{ ...valStyle, color: state.alt_metrics?.fear_and_greed?.value > 75 ? '#F23645' : '#089981' }}>
                    {state.alt_metrics?.fear_and_greed?.value}{' '}
                    <span style={{ fontSize: '11px', color: '#787B86', fontWeight: 'bold', textTransform: 'uppercase' }}>
                        ({state.alt_metrics?.fear_and_greed?.classification})
                    </span>
                </div>
            </div>

            {/* 6. DXY Liquidity Tracker */}
            <div style={sectionStyle}>
                <div style={labelStyle}>DXY Liquidity Tracker</div>
                <div style={{ ...valStyle, color: state.alt_metrics?.fii_proxy?.fii_trend?.includes('RISING') ? '#F23645' : '#089981' }}>
                    {state.alt_metrics?.fii_proxy?.dxy_value}{' '}
                    <Globe size={14} style={{ display: 'inline', marginBottom: '-2px', color: '#787B86' }} />
                </div>
            </div>
        </div>
    );
}

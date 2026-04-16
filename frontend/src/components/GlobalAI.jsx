import React, { useState } from 'react';
import { Target, ShieldAlert, Clock, Zap, TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';

export default function GlobalAI({ briefing }) {
  const [filter, setFilter] = useState('ALL'); // ALL, BUY, SELL, HOLD

  if (!briefing) return (
    <div style={{ padding: '40px', color: '#787B86', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Activity size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
      <h2 style={{ color: '#D1D4DC' }}>No AI Briefing Available</h2>
      <p>Run the "Global AI" pipeline from the top navigation bar to generate your strategy.</p>
    </div>
  );

  const proj = briefing.future_projections || {};

  // 🎛️ ACTION FILTER LOGIC
  const filteredDirectives = briefing.directives?.filter(d => {
    if (filter === 'ALL') return true;
    if (filter === 'BUY') return d.action.includes('BUY') || d.action.includes('AVG DOWN');
    if (filter === 'SELL') return d.action.includes('SELL') || d.action.includes('PROFIT');
    if (filter === 'HOLD') return d.action === 'HOLD';
    return true;
  }) || [];

  // 🎨 UI HELPERS
  const getActionTheme = (action) => {
    if (action.includes('BUY') || action.includes('AVG')) return { color: '#089981', bg: 'rgba(8, 153, 129, 0.1)', icon: <TrendingUp size={20} /> };
    if (action.includes('SELL') || action.includes('PROFIT')) return { color: '#F23645', bg: 'rgba(242, 54, 69, 0.1)', icon: <TrendingDown size={20} /> };
    return { color: '#EAB308', bg: 'rgba(234, 179, 8, 0.1)', icon: <Minus size={20} /> };
  };

  const filterBtnStyle = (active) => ({
    padding: '6px 16px', cursor: 'pointer', borderRadius: '6px', border: '1px solid #2A2E39',
    backgroundColor: active ? '#2A2E39' : 'transparent', color: active ? '#F8FAFC' : '#787B86',
    fontWeight: 'bold', fontSize: '12px', transition: '0.2s'
  });

  return (
    <div style={{ padding: '32px', backgroundColor: '#0B0E14', height: '100%', overflowY: 'auto', color: '#D1D4DC' }}>

      {/* --- 1. MACRO ENVIRONMENT --- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: '#131722', padding: '24px', borderRadius: '12px', borderTop: '4px solid #2962FF', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>
          <div style={{ fontSize: '11px', color: '#787B86', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.5px' }}>30D Estimated Trend</div>
          <div style={{ fontSize: '28px', fontWeight: '900', marginTop: '8px', color: '#F8FAFC' }}>{proj.estimated_30d_trend}</div>
        </div>
        <div style={{ backgroundColor: '#131722', padding: '24px', borderRadius: '12px', borderTop: '4px solid #F23645', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>
          <div style={{ fontSize: '11px', color: '#787B86', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.5px' }}>Portfolio Risk Level</div>
          <div style={{ fontSize: '28px', fontWeight: '900', marginTop: '8px', color: '#F8FAFC' }}>{proj.portfolio_risk_level}</div>
        </div>
        <div style={{ backgroundColor: '#131722', padding: '24px', borderRadius: '12px', borderTop: '4px solid #EAB308', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>
          <div style={{ fontSize: '11px', color: '#787B86', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.5px' }}>Catalyst Watch</div>
          <div style={{ fontSize: '16px', fontWeight: '600', marginTop: '8px', lineHeight: '1.5', color: '#EAB308' }}>{proj.catalyst_watch}</div>
        </div>
      </div>

      {/* --- 2. GLOBAL SYNTHESIS --- */}
      <div style={{ backgroundColor: '#131722', padding: '32px', borderRadius: '12px', border: '1px solid #2A2E39', marginBottom: '40px', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>
        <h2 style={{ marginTop: 0, color: '#2962FF', fontSize: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity size={28} /> Global Macro Synthesis
        </h2>
        <div style={{ backgroundColor: 'rgba(41, 98, 255, 0.05)', padding: '16px', borderRadius: '8px', borderLeft: '3px solid #2962FF', marginBottom: '16px' }}>
          <p style={{ color: '#D1D4DC', fontSize: '15px', lineHeight: '1.6', margin: 0 }}><strong>Vibe:</strong> {briefing.market_vibe}</p>
        </div>
        <p style={{ color: '#94A3B8', fontSize: '14px', lineHeight: '1.8', margin: 0 }}>{briefing.macro_analysis}</p>
      </div>

      {/* --- 3. SWING TRADE DIRECTIVES --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #2A2E39', paddingBottom: '16px' }}>
        <h2 style={{ margin: 0, color: '#F8FAFC' }}>🎯 Executive Trade Directives</h2>
        <div style={{ display: 'flex', gap: '8px', backgroundColor: '#131722', padding: '6px', borderRadius: '8px', border: '1px solid #2A2E39' }}>
          <button style={filterBtnStyle(filter === 'ALL')} onClick={() => setFilter('ALL')}>All ({briefing.directives?.length || 0})</button>
          <button style={filterBtnStyle(filter === 'BUY')} onClick={() => setFilter('BUY')}>Bullish</button>
          <button style={filterBtnStyle(filter === 'SELL')} onClick={() => setFilter('SELL')}>Bearish</button>
          <button style={filterBtnStyle(filter === 'HOLD')} onClick={() => setFilter('HOLD')}>Holds</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '24px' }}>
        {filteredDirectives.map((d, i) => {
          const theme = getActionTheme(d.action);
          const stars = "⭐".repeat(Math.min(5, Math.max(1, d.conviction_level || 3)));
          const isCrypto = d.symbol.includes('-USD');

          return (
            <div key={i} style={{ backgroundColor: '#131722', padding: '24px', borderRadius: '12px', border: '1px solid #2A2E39', borderTop: `5px solid ${theme.color}`, transition: '0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '24px', color: '#F8FAFC' }}>{d.symbol.split('.')[0]}</h3>
                  <span style={{ fontSize: '11px', color: '#787B86', backgroundColor: '#0B0E14', padding: '4px 8px', borderRadius: '4px' }}>{isCrypto ? 'CRYPTO' : 'EQUITY'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '900', color: theme.color, fontSize: '16px', backgroundColor: theme.bg, padding: '8px 16px', borderRadius: '8px' }}>
                  {theme.icon} {d.action}
                </div>
              </div>

              {/* Impact Block */}
              <div style={{ backgroundColor: '#0B0E14', padding: '16px', borderRadius: '8px', marginBottom: '20px', borderLeft: `3px solid ${theme.color}` }}>
                <div style={{ fontSize: '11px', color: '#787B86', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={14} color={theme.color} /> Financial Impact (P&L Expected)
                </div>
                <div style={{ fontSize: '15px', color: '#D1D4DC', marginTop: '6px', fontWeight: '500' }}>{d.financial_impact || "Evaluation Pending"}</div>
              </div>

              {/* Swing Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px', backgroundColor: '#0B0E14', padding: '16px', borderRadius: '8px', border: '1px solid #1E222D' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#787B86', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldAlert size={12} /> Sizing</div>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#F8FAFC' }}>{d.position_sizing}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#787B86', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> Horizon</div>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#F8FAFC' }}>{d.time_horizon}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#787B86', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Target size={12} /> R/R Ratio</div>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#38bdf8' }}>{d.risk_reward_ratio || '1:2 Min'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#787B86', marginBottom: '4px' }}>Conviction</div>
                  <div style={{ fontSize: '13px' }}>{stars}</div>
                </div>
              </div>

              {/* The Why */}
              <div style={{ fontSize: '14px', color: '#94A3B8', lineHeight: '1.6' }}>
                <strong style={{ color: '#D1D4DC' }}>Macro Reasoning:</strong> {d.the_why}
              </div>
            </div>
          );
        })}
      </div>

      {filteredDirectives.length === 0 && briefing.directives?.length > 0 && (
        <div style={{ textAlign: 'center', color: '#787B86', padding: '40px' }}>No directives match your current filter.</div>
      )}

      {/* --- 4. MONITORED ASSETS --- */}
      <div style={{ marginTop: '40px', padding: '24px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed #2A2E39' }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#787B86', fontSize: '16px' }}>⏭️ Monitored Assets (No Action Required)</h4>
        <div style={{ fontSize: '14px', color: '#94A3B8', lineHeight: '1.6' }}>{briefing.skipped_assets_summary}</div>
      </div>
    </div>
  );
}
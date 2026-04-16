import React, { useState, useMemo, useEffect } from 'react';
import { X, ExternalLink, Activity, AlertCircle, CheckCircle2, Clock, Loader2, Bot } from 'lucide-react';
import { apiService } from '../api/apiService';
import { toast } from 'react-hot-toast';

export default function NewsFeed({ state, loadState }) {
    const [filter, setFilter] = useState('ALL');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [selectedArticle, setSelectedArticle] = useState(null); // State for Deep Dive Modal

    // ⌨️ ACCESSIBILITY: Close modal on 'Escape' key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') setSelectedArticle(null);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    // 🛡️ DATA LOGIC: Safely aggregate news with pre-calculated sentiment
    const newsItems = useMemo(() => {
        const items = [];
        if (!state || !state.news) return items;

        Object.keys(state.news).forEach(symbol => {
            const articles = state.news[symbol];
            if (!Array.isArray(articles)) return;

            articles.forEach((art, index) => {
                const hasAI = !!art.sentiment;
                const sentiment = art.sentiment || { bias: 'PENDING', confidence: null, impact_summary: 'AI Analysis Pending. Click "Analyze Pending Articles".' };

                items.push({
                    id: art.id || `${symbol}_${index}`, // Fallback if ID is missing from DB
                    symbol,
                    title: art.title,
                    snippet: art.snippet,
                    link: art.link,
                    provider: art.provider,
                    bias: sentiment.bias?.toUpperCase() || 'PENDING',
                    confidence: sentiment.confidence,
                    impact: sentiment.impact_summary,
                    hasAI: hasAI,
                    sortWeight: index // Retain chronological sorting logic
                });
            });
        });
        return items.sort((a, b) => a.sortWeight - b.sortWeight);
    }, [state]);

    const filteredNews = newsItems.filter(item => {
        if (filter === 'ALL') return true;
        if (filter === 'POSITIVE') return item.bias.includes('POSITIVE') || item.bias.includes('BULL');
        if (filter === 'NEGATIVE') return item.bias.includes('NEGATIVE') || item.bias.includes('BEAR');
        if (filter === 'PENDING') return !item.hasAI || item.bias.includes('PENDING');
        return true;
    });

    const pendingCount = newsItems.filter(item => !item.hasAI).length;

    // 🚀 BATCH ANALYZE HANDLER
    const handleBatchAnalyze = async () => {
        if (pendingCount === 0) {
            toast.success("All news is already analyzed!");
            return;
        }
        setIsAnalyzing(true);

        const promise = async () => {
            const res = await apiService.analyzeNewsBatch();
            // Backend enqueues async task; "enqueued" and "success" are both fine
            if (res.status !== 'success' && res.status !== 'enqueued') {
                throw new Error("Backend reported failure.");
            }
            // Wait briefly for the task to process, then reload state
            await new Promise(r => setTimeout(r, 3000));
            if (typeof loadState === 'function') {
                await loadState();
            } else {
                window.location.reload();
            }
        };

        await toast.promise(promise(), {
            loading: `Analyzing ${pendingCount} pending articles...`,
            success: 'News Sentiment Matrix Updated!',
            error: 'Failed to update UI.'
        });

        setIsAnalyzing(false);
    };

    // 🎨 DESIGN SYSTEM: Colors & Typography
    const colors = {
        bgMain: '#0B0E14',
        bgCard: '#0f172a',
        bgHover: '#1e293b',
        border: '#1e293b',
        borderHover: '#334155',
        textPrimary: '#f8fafc',
        textSecondary: '#94a3b8',
        bullish: '#089981',
        bearish: '#F23645',
        neutral: '#EAB308',
        pending: '#64748B'
    };

    const getBiasTheme = (bias) => {
        if (bias.includes('POSITIVE') || bias.includes('BULL')) return { color: colors.bullish, bg: 'rgba(8, 153, 129, 0.15)', icon: <CheckCircle2 size={14} /> };
        if (bias.includes('NEGATIVE') || bias.includes('BEAR')) return { color: colors.bearish, bg: 'rgba(242, 54, 69, 0.15)', icon: <AlertCircle size={14} /> };
        if (bias.includes('NEUTRAL')) return { color: colors.neutral, bg: 'rgba(234, 179, 8, 0.15)', icon: <Activity size={14} /> };
        return { color: colors.pending, bg: 'transparent', icon: <Clock size={14} /> };
    };

    const filterBtnStyle = (active) => ({
        padding: '6px 12px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px',
        backgroundColor: active ? '#1E293B' : 'transparent', color: active ? '#38BDF8' : '#64748B', transition: '0.2s'
    });

    return (
        <div style={{ padding: '30px', backgroundColor: colors.bgMain, height: '100%', overflowY: 'auto', position: 'relative' }}>

            {/* HEADER & FILTERS */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: `1px solid ${colors.border}`, paddingBottom: '20px' }}>
                <div>
                    <h2 style={{ color: colors.textPrimary, margin: '0 0 8px 0', fontSize: '24px', fontWeight: '700', letterSpacing: '-0.5px' }}>
                        📰 Global Market Squawk
                    </h2>
                    <div style={{ color: colors.textSecondary, fontSize: '14px' }}>
                        Real-time Institutional Catalysts & NLP Sentiment Analysis
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    {/* The Master Action Button */}
                    <button
                        onClick={handleBatchAnalyze} disabled={isAnalyzing || pendingCount === 0}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '13px', transition: '0.2s',
                            cursor: (isAnalyzing || pendingCount === 0) ? 'not-allowed' : 'pointer',
                            backgroundColor: pendingCount > 0 ? '#2962FF' : '#1E293B',
                            color: pendingCount > 0 ? '#FFF' : '#64748B',
                        }}
                    >
                        {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
                        Analyze {pendingCount} Pending Articles
                    </button>

                    <div style={{ width: '1px', height: '30px', backgroundColor: '#2A2E39', margin: '0 5px' }} />

                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '8px', backgroundColor: '#0F172A', padding: '6px', borderRadius: '8px', border: `1px solid ${colors.border}` }}>
                        <button style={filterBtnStyle(filter === 'ALL')} onClick={() => setFilter('ALL')}>🌐 All ({newsItems.length})</button>
                        <button style={filterBtnStyle(filter === 'POSITIVE')} onClick={() => setFilter('POSITIVE')}>🟢 Positive</button>
                        <button style={filterBtnStyle(filter === 'NEGATIVE')} onClick={() => setFilter('NEGATIVE')}>🔴 Negative</button>
                        <button style={filterBtnStyle(filter === 'PENDING')} onClick={() => setFilter('PENDING')}>⏳ Pending</button>
                    </div>
                </div>
            </div>

            {/* MASONRY / GRID LAYOUT */}
            {filteredNews.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '24px' }}>
                    {filteredNews.map((item, i) => {
                        const theme = getBiasTheme(item.bias);
                        return (
                            <div key={i}
                                onClick={() => setSelectedArticle(item)} // 🚀 TRIGGER DEEP DIVE MODAL
                                style={{
                                    display: 'flex', flexDirection: 'column', backgroundColor: colors.bgCard,
                                    borderRadius: '12px', border: `1px solid ${colors.border}`, padding: '20px',
                                    transition: 'all 0.2s ease', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.borderColor = colors.borderHover;
                                    e.currentTarget.style.transform = 'translateY(-3px)';
                                    e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.3)';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.borderColor = colors.border;
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                                }}
                            >
                                {/* Card Header: Symbol & Badges */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <div style={{ fontWeight: '800', fontSize: '18px', color: colors.textPrimary, letterSpacing: '0.5px' }}>
                                        {item.symbol}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '10px', backgroundColor: '#0B0E14', color: colors.textSecondary, padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                                            {item.provider}
                                        </span>
                                        {item.hasAI ? (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 'bold', backgroundColor: theme.bg, color: theme.color, padding: '4px 8px', borderRadius: '4px' }}>
                                                {theme.icon} {item.bias} {item.confidence ? `(${item.confidence}%)` : ''}
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '11px', fontWeight: 'bold', backgroundColor: '#1E293B', color: '#94A3B8', padding: '4px 8px', borderRadius: '4px', border: '1px dashed #475569' }}>
                                                ⏳ PENDING AI
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Typography Hierarchy: Title & Snippet */}
                                <h3 style={{ fontSize: '15px', color: '#38bdf8', margin: '0 0 10px 0', lineHeight: '1.4', fontWeight: '600' }}>
                                    {item.title}
                                </h3>
                                <p style={{ fontSize: '13px', color: colors.textSecondary, margin: '0 0 20px 0', lineHeight: '1.6', flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {item.snippet}
                                </p>

                                {/* AI Impact Summary */}
                                <div style={{ backgroundColor: '#020617', padding: '12px 16px', borderRadius: '8px', borderLeft: `3px ${item.hasAI ? 'solid' : 'dashed'} ${theme.color}` }}>
                                    <div style={{ fontSize: '10px', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: '6px', fontWeight: '700', letterSpacing: '0.5px' }}>
                                        {item.hasAI ? 'AI Impact Analysis' : 'AI Status'}
                                    </div>
                                    <div style={{ fontSize: '12px', color: item.hasAI ? colors.textPrimary : colors.textSecondary, lineHeight: '1.5', fontStyle: item.hasAI ? 'normal' : 'italic' }}>
                                        {item.impact}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', color: colors.textSecondary }}>
                    <Activity size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                    <h3 style={{ margin: '0 0 8px 0', color: colors.textPrimary }}>No articles match this filter.</h3>
                    <p style={{ margin: 0 }}>Adjust your filters or ensure you have run "Scrape News" in the control panel.</p>
                </div>
            )}

            {/* ========================================= */}
            {/* 🔍 THE "DEEP DIVE" MODAL (Pop-up)          */}
            {/* ========================================= */}
            {selectedArticle && (
                <div
                    onClick={() => setSelectedArticle(null)} // Click overlay to close
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(4px)',
                        zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()} // Prevent clicks inside modal from closing it
                        style={{
                            backgroundColor: colors.bgCard, width: '100%', maxWidth: '800px', maxHeight: '85vh',
                            borderRadius: '16px', border: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', overflow: 'hidden'
                        }}
                    >
                        {/* Modal Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: `1px solid ${colors.border}`, backgroundColor: '#1e293b' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontWeight: '800', fontSize: '20px', color: colors.textPrimary }}>{selectedArticle.symbol}</span>
                                <span style={{ fontSize: '11px', backgroundColor: '#0B0E14', color: colors.textSecondary, padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', textTransform: 'uppercase' }}>{selectedArticle.provider}</span>
                            </div>
                            <button onClick={() => setSelectedArticle(null)} style={{ background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer', padding: '4px', display: 'flex' }}>
                                <X size={24} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '32px 32px', overflowY: 'auto', flex: 1 }}>
                            <h2 style={{ fontSize: '24px', color: '#f8fafc', marginTop: 0, marginBottom: '24px', lineHeight: '1.3', fontWeight: '700' }}>
                                {selectedArticle.title}
                            </h2>

                            <div style={{ fontSize: '15px', color: '#cbd5e1', lineHeight: '1.8', marginBottom: '32px', whiteSpace: 'pre-wrap' }}>
                                {selectedArticle.snippet}
                                <br /><br />
                                <em style={{ color: colors.textSecondary, fontSize: '13px' }}>(Abstract summary provided by institutional RSS feed).</em>
                            </div>

                            {/* Modal AI Analysis Block */}
                            <div style={{ backgroundColor: '#020617', padding: '24px', borderRadius: '12px', borderLeft: `4px ${selectedArticle.hasAI ? 'solid' : 'dashed'} ${getBiasTheme(selectedArticle.bias).color}`, marginBottom: '32px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                    {getBiasTheme(selectedArticle.bias).icon}
                                    <h4 style={{ margin: 0, color: colors.textPrimary, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '14px' }}>
                                        Proprietary AI Impact ({selectedArticle.bias})
                                    </h4>
                                </div>
                                <p style={{ margin: 0, fontSize: '14px', color: colors.textSecondary, lineHeight: '1.6' }}>
                                    {selectedArticle.impact}
                                </p>
                            </div>

                            {/* Call to Action: Read Original */}
                            <a href={selectedArticle.link} target="_blank" rel="noopener noreferrer"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                                    backgroundColor: '#2563eb', color: 'white', padding: '12px 24px',
                                    borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px',
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                            >
                                Read Full Article on {selectedArticle.provider} <ExternalLink size={16} />
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
import React, {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'react-hot-toast';
import {apiService} from '@/api/apiService';
import {AUREON_STATE_KEY} from '@/hooks/useAureonData';
import {Eyebrow} from '../ui';

function formatFreshness(isoStr) {
    if (!isoStr) return {formatted: 'Never synced', isStale: true};
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return {formatted: 'Never synced', isStale: true};

    const hoursAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60);
    const isStale = hoursAgo > 24;

    const formatted = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    return {formatted, isStale};
}

export function DataFreshnessStrip({freshness}) {
    const queryClient = useQueryClient();
    const [syncing, setSyncing] = useState(false);

    const priceInfo = formatFreshness(freshness?.refresh_prices);
    const newsInfo = formatFreshness(freshness?.fetch_news);
    const briefingInfo = formatFreshness(freshness?.daily_briefing);

    const hasStaleData = priceInfo.isStale || newsInfo.isStale || briefingInfo.isStale;

    const handleSync = async () => {
        setSyncing(true);
        const tid = toast.loading('Running daily pipeline...');
        try {
            await apiService.hardRefresh();
            toast.success('Pipeline ran successfully', {id: tid});
            queryClient.invalidateQueries({queryKey: AUREON_STATE_KEY});
        } catch (err) {
            toast.error(err?.message || 'Pipeline failed', {id: tid});
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginBottom: 20,
        }}>
            {hasStaleData && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(209,107,107,0.08)',
                    border: '1px solid rgba(209,107,107,0.20)',
                    color: 'var(--crimson-400)',
                    fontSize: 12,
                }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>Portfolio data is stale (&gt; 24 hours old). Trigger a manual sync to refresh.</span>
                </div>
            )}

            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr auto',
                gap: 12,
                alignItems: 'center',
            }}>
                {/* Price Freshness Card */}
                <div style={{
                    padding: '12px 14px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.01)',
                }}>
                    <Eyebrow>Asset Prices</Eyebrow>
                    <div style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 6,
                        marginTop: 4,
                    }}>
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            color: priceInfo.isStale ? 'var(--aurum-100)' : 'var(--sage-500)',
                            fontWeight: 600,
                        }}>
                            {priceInfo.formatted}
                        </span>
                        {priceInfo.isStale && (
                            <span style={{fontSize: 10, color: 'var(--aurum-100)'}}> (stale)</span>
                        )}
                    </div>
                </div>

                {/* News Freshness Card */}
                <div style={{
                    padding: '12px 14px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.01)',
                }}>
                    <Eyebrow>Market News</Eyebrow>
                    <div style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 6,
                        marginTop: 4,
                    }}>
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            color: newsInfo.isStale ? 'var(--aurum-100)' : 'var(--sage-500)',
                            fontWeight: 600,
                        }}>
                            {newsInfo.formatted}
                        </span>
                        {newsInfo.isStale && (
                            <span style={{fontSize: 10, color: 'var(--aurum-100)'}}> (stale)</span>
                        )}
                    </div>
                </div>

                {/* AI Briefing Freshness Card */}
                <div style={{
                    padding: '12px 14px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.01)',
                }}>
                    <Eyebrow>AI Briefings</Eyebrow>
                    <div style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 6,
                        marginTop: 4,
                    }}>
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            color: briefingInfo.isStale ? 'var(--aurum-100)' : 'var(--sage-500)',
                            fontWeight: 600,
                        }}>
                            {briefingInfo.formatted}
                        </span>
                        {briefingInfo.isStale && (
                            <span style={{fontSize: 10, color: 'var(--aurum-100)'}}> (stale)</span>
                        )}
                    </div>
                </div>

                {/* Sync Now Button */}
                <button
                    onClick={handleSync}
                    disabled={syncing}
                    style={{
                        height: '100%',
                        padding: '0 20px',
                        borderRadius: 8,
                        background: syncing ? 'rgba(255,255,255,0.03)' : 'rgba(201,168,106,0.10)',
                        border: '1px solid rgba(201,168,106,0.25)',
                        color: syncing ? 'var(--ink-40)' : 'var(--aurum-100)',
                        cursor: syncing ? 'not-allowed' : 'pointer',
                        fontSize: 12.5,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <svg
                        style={{
                            animation: syncing ? 'spin 1.5s linear infinite' : 'none',
                        }}
                        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    >
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                    </svg>
                    {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
            </div>
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}} />
        </div>
    );
}

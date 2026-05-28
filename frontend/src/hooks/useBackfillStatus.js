import {useCallback, useEffect, useState} from 'react';
import {apiService} from '@/api/apiService';
import {useUserSocket} from './useUserSocket';

export function useBackfillStatus() {
    const [pending, setPending] = useState(new Set());
    const {lastEvent} = useUserSocket();

    useEffect(() => {
        if (!lastEvent) return;
        if (lastEvent.type === 'backfill_done' || lastEvent.type === 'backfill_failed') {
            setPending(prev => {
                const next = new Set(prev);
                next.delete(lastEvent.symbol);
                return next;
            });
        }
    }, [lastEvent]);

    const triggerBackfill = useCallback(async (symbol) => {
        setPending(prev => new Set([...prev, symbol]));
        try {
            const res = await apiService.triggerBackfill(symbol);
            if (res.status === 'already_populated') {
                setPending(prev => {
                    const next = new Set(prev);
                    next.delete(symbol);
                    return next;
                });
            }
        } catch {
            setPending(prev => {
                const next = new Set(prev);
                next.delete(symbol);
                return next;
            });
        }
    }, []);

    return {pending, triggerBackfill};
}

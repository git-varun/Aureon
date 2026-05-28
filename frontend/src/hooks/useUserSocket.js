import {useEffect, useRef, useState} from 'react';

function decodeJwt(token) {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
        return null;
    }
}

export function useUserSocket() {
    const [lastEvent, setLastEvent] = useState(null);
    const wsRef = useRef(null);
    const backoffRef = useRef(1000);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;

        function connect() {
            if (!mountedRef.current) return;

            const token = localStorage.getItem('access_token');
            if (!token) return;

            const payload = decodeJwt(token);
            if (!payload?.sub) return;

            const userId = payload.sub;
            const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
            const host = window.location.host;
            const url = `${proto}://${host}/ws/user/${userId}?token=${encodeURIComponent(token)}`;

            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onmessage = (evt) => {
                try {
                    const data = JSON.parse(evt.data);
                    if (mountedRef.current) setLastEvent(data);
                } catch {
                    // ignore malformed messages
                }
            };

            ws.onclose = (evt) => {
                if (!mountedRef.current) return;
                if (evt.code !== 1000 && evt.code !== 1008) {
                    // Reconnect with exponential backoff (cap at 30s)
                    const delay = Math.min(backoffRef.current, 30000);
                    backoffRef.current = Math.min(backoffRef.current * 2, 30000);
                    setTimeout(connect, delay);
                }
            };

            ws.onopen = () => {
                backoffRef.current = 1000;
            };
        }

        connect();

        return () => {
            mountedRef.current = false;
            if (wsRef.current) {
                wsRef.current.close(1000, 'unmount');
                wsRef.current = null;
            }
        };
    }, []);

    return {lastEvent};
}

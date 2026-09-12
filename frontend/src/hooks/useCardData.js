import { useState, useEffect, useRef } from 'react';

/**
 * Per-card async state machine.
 * status: 'loading' | 'ready' | 'empty' | 'error'
 * null/[] data → 'empty'. Error thrown → 'error'.
 */
export function useCardData(fetchFn) {
  const fn = useRef(fetchFn);
  fn.current = fetchFn;
  const [tick, setTick] = useState(0);
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  // Dedupes the request StrictMode's dev-only double-invoke (mount -> cleanup
  // -> mount, synchronously, before either fetch settles) would otherwise
  // fire twice for the same tick — every useCardData-backed card
  // (concentration, health/diversification trend) was hitting its endpoint
  // twice on every load. Refs survive that remount, so the second
  // invocation reuses the first's in-flight promise instead of calling
  // fn.current() again. A real refetch() bumps tick, which still starts a
  // fresh request.
  const inFlight = useRef(null);

  useEffect(() => {
    let dead = false;
    setState(s => ({ ...s, status: 'loading', error: null }));
    if (!inFlight.current || inFlight.current.tick !== tick) {
      inFlight.current = { tick, promise: fn.current() };
    }
    inFlight.current.promise
      .then(d => {
        if (!dead) setState({
          status: (d == null || (Array.isArray(d) && !d.length)) ? 'empty' : 'ready',
          data: d,
          error: null,
        });
      })
      .catch(e => {
        if (!dead) setState({ status: 'error', data: null, error: e?.message || 'Unknown error' });
      });
    return () => { dead = true; };
  }, [tick]);

  return { ...state, refetch: () => setTick(t => t + 1) };
}

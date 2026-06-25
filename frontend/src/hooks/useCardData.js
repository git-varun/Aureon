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

  useEffect(() => {
    let dead = false;
    setState(s => ({ ...s, status: 'loading', error: null }));
    fn.current()
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

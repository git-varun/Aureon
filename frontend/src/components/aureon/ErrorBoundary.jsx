import React from 'react';

export class ErrorBoundary extends React.Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error, info?.componentStack);
    }

    componentDidUpdate(prevProps) {
        // resetKey (e.g. the current route) changing while an error is shown
        // means the user navigated away — clear the stale error rather than
        // leaving every subsequent page stuck on "Something went wrong" until
        // a manual Retry click, since React Router swaps <Route> elements
        // underneath this boundary without remounting it.
        if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
        }
    }

    render() {
        if (this.state.error) {
            return (
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 12, color: 'var(--ink-40)', fontSize: 13,
                }}>
                    <span>Something went wrong rendering this page.</span>
                    <button
                        onClick={() => this.setState({ error: null })}
                        className="du3-cta ghost"
                    >
                        Retry
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

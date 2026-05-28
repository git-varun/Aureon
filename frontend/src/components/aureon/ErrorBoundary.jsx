import React from 'react';

export class ErrorBoundary extends React.Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
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

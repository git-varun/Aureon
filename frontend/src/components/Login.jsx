import React, {useState} from 'react';
import axios from 'axios';

const BASE_URL = 'http://localhost:8001/api';

const styles = {
    container: {
        minHeight: '100vh',
        background: '#0B0E14',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    card: {
        background: '#131722',
        border: '1px solid #1E222D',
        borderRadius: '8px',
        padding: '40px',
        width: '100%',
        maxWidth: '380px',
    },
    logo: {
        textAlign: 'center',
        marginBottom: '32px',
    },
    title: {
        color: '#D1D4DC',
        fontSize: '20px',
        fontWeight: '600',
        margin: '0 0 4px',
    },
    subtitle: {
        color: '#787B86',
        fontSize: '13px',
        margin: 0,
    },
    tabs: {
        display: 'flex',
        borderBottom: '1px solid #1E222D',
        marginBottom: '24px',
    },
    tab: (active) => ({
        flex: 1,
        background: 'none',
        border: 'none',
        padding: '10px',
        color: active ? '#D1D4DC' : '#787B86',
        fontSize: '13px',
        fontWeight: active ? '600' : '400',
        cursor: 'pointer',
        borderBottom: active ? '2px solid #2962FF' : '2px solid transparent',
        marginBottom: '-1px',
    }),
    field: {
        marginBottom: '16px',
    },
    label: {
        display: 'block',
        color: '#787B86',
        fontSize: '12px',
        marginBottom: '6px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
    input: {
        width: '100%',
        background: '#0B0E14',
        border: '1px solid #1E222D',
        borderRadius: '4px',
        padding: '10px 12px',
        color: '#D1D4DC',
        fontSize: '14px',
        outline: 'none',
        boxSizing: 'border-box',
    },
    btn: {
        width: '100%',
        background: '#2962FF',
        border: 'none',
        borderRadius: '4px',
        padding: '12px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        marginTop: '8px',
    },
    btnDisabled: {
        opacity: 0.6,
        cursor: 'not-allowed',
    },
    error: {
        background: 'rgba(242, 54, 69, 0.1)',
        border: '1px solid rgba(242, 54, 69, 0.3)',
        borderRadius: '4px',
        color: '#F23645',
        fontSize: '13px',
        padding: '10px 12px',
        marginBottom: '16px',
    },
};

export default function Login({onLogin}) {
    const [mode, setMode] = useState('login');
    const [firstName, setFirstName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const url = mode === 'login' ? `${BASE_URL}/auth/login` : `${BASE_URL}/auth/register`;
            const body = mode === 'login'
                ? {email, password}
                : {email, password, first_name: firstName, last_name: ''};

            const res = await axios.post(url, body);
            const data = res.data;

            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('refresh_token', data.refresh_token);
            localStorage.setItem('user_first_name', firstName || email.split('@')[0]);
            onLogin();
        } catch (err) {
            const msg = err.response?.data?.message || err.response?.data?.detail || 'Authentication failed.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={styles.logo}>
                    <p style={styles.title}>Investment OS</p>
                    <p style={styles.subtitle}>Personal Portfolio Platform</p>
                </div>

                <div style={styles.tabs}>
                    <button style={styles.tab(mode === 'login')} onClick={() => {
                        setMode('login');
                        setError('');
                    }}>
                        Sign In
                    </button>
                    <button style={styles.tab(mode === 'register')} onClick={() => {
                        setMode('register');
                        setError('');
                    }}>
                        Register
                    </button>
                </div>

                {error && <div style={styles.error}>{error}</div>}

                <form onSubmit={handleSubmit}>
                    {mode === 'register' && (
                        <div style={styles.field}>
                            <label style={styles.label}>Your Name</label>
                            <input
                                style={styles.input}
                                type="text"
                                value={firstName}
                                onChange={e => setFirstName(e.target.value)}
                                placeholder="First name"
                                autoComplete="given-name"
                            />
                        </div>
                    )}
                    <div style={styles.field}>
                        <label style={styles.label}>Email</label>
                        <input
                            style={styles.input}
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            autoComplete="email"
                        />
                    </div>
                    <div style={styles.field}>
                        <label style={styles.label}>Password</label>
                        <input
                            style={styles.input}
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        />
                    </div>
                    <button
                        type="submit"
                        style={{...styles.btn, ...(loading ? styles.btnDisabled : {})}}
                        disabled={loading}
                    >
                        {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
                    </button>
                </form>
            </div>
        </div>
    );
}

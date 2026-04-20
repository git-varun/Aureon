import React, {useState} from 'react';
import {Eye, EyeOff, AlertCircle} from 'lucide-react';
import {apiService} from '../api/apiService';
import toast from 'react-hot-toast';

const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0B0E14 0%, #131722 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '20px',
    },
    card: {
        background: '#131722',
        border: '1px solid #1E222D',
        borderRadius: '8px',
        padding: '48px 40px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    },
    logo: {
        textAlign: 'center',
        marginBottom: '40px',
    },
    logoText: {
        fontSize: '32px',
        marginBottom: '12px',
    },
    title: {
        color: '#D1D4DC',
        fontSize: '24px',
        fontWeight: '700',
        margin: '0 0 8px',
    },
    subtitle: {
        color: '#787B86',
        fontSize: '14px',
        margin: 0,
        letterSpacing: '0.3px',
    },
    tabs: {
        display: 'flex',
        borderBottom: '1px solid #1E222D',
        marginBottom: '32px',
        gap: '16px',
    },
    tab: (active) => ({
        flex: 1,
        background: 'none',
        border: 'none',
        padding: '12px 0',
        color: active ? '#2962FF' : '#787B86',
        fontSize: '14px',
        fontWeight: active ? '600' : '500',
        cursor: 'pointer',
        borderBottom: active ? '2px solid #2962FF' : '2px solid transparent',
        marginBottom: '-1px',
        transition: 'color 0.2s',
    }),
    field: {
        marginBottom: '20px',
    },
    label: {
        display: 'block',
        color: '#787B86',
        fontSize: '12px',
        marginBottom: '8px',
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        fontWeight: '600',
    },
    inputWrapper: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
    },
    input: {
        width: '100%',
        background: '#0B0E14',
        border: '1px solid #1E222D',
        borderRadius: '4px',
        padding: '12px 16px',
        color: '#D1D4DC',
        fontSize: '14px',
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.2s',
    },
    inputFocus: {
        borderColor: '#2962FF',
    },
    eyeToggle: {
        position: 'absolute',
        right: '12px',
        background: 'none',
        border: 'none',
        color: '#787B86',
        cursor: 'pointer',
        padding: '4px',
        display: 'flex',
        alignItems: 'center',
    },
    btn: {
        width: '100%',
        background: 'linear-gradient(135deg, #2962FF 0%, #1E53E5 100%)',
        border: 'none',
        borderRadius: '4px',
        padding: '14px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: '700',
        cursor: 'pointer',
        marginTop: '12px',
        transition: 'opacity 0.2s',
        letterSpacing: '0.3px',
    },
    btnDisabled: {
        opacity: 0.6,
        cursor: 'not-allowed',
    },
    error: {
        background: 'rgba(242, 54, 69, 0.08)',
        border: '1px solid rgba(242, 54, 69, 0.3)',
        borderRadius: '4px',
        color: '#F23645',
        fontSize: '13px',
        padding: '12px 14px',
        marginBottom: '20px',
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-start',
    },
    link: {
        color: '#2962FF',
        textDecoration: 'none',
        cursor: 'pointer',
        fontSize: '13px',
        marginTop: '12px',
        textAlign: 'center',
        display: 'block',
    },
};

export default function SignIn({onLogin}) {
    const [mode, setMode] = useState('login');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [focusedField, setFocusedField] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            let result;
            if (mode === 'login') {
                result = await apiService.login(email, password);
            } else {
                result = await apiService.register(email, password, firstName, lastName);
            }

            // Store tokens and user info
            localStorage.setItem('access_token', result.access_token);
            localStorage.setItem('refresh_token', result.refresh_token);
            localStorage.setItem('user_id', result.user_id);
            localStorage.setItem('user_email', email);
            localStorage.setItem('user_name', firstName || email.split('@')[0]);

            toast.success(mode === 'login' ? 'Signed in successfully!' : 'Account created!');
            onLogin();
        } catch (err) {
            const msg = err.message || 'Authentication failed';
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = (newMode) => {
        setMode(newMode);
        setError('');
        setEmail('');
        setPassword('');
        setFirstName('');
        setLastName('');
        setShowPassword(false);
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                {/* Logo */}
                <div style={styles.logo}>
                    <div style={styles.logoText}>🏛️</div>
                    <h1 style={styles.title}>Investment OS</h1>
                    <p style={styles.subtitle}>Personal Portfolio Management Platform</p>
                </div>

                {/* Tabs */}
                <div style={styles.tabs}>
                    <button
                        style={styles.tab(mode === 'login')}
                        onClick={() => toggleMode('login')}
                    >
                        Sign In
                    </button>
                    <button
                        style={styles.tab(mode === 'register')}
                        onClick={() => toggleMode('register')}
                    >
                        Register
                    </button>
                </div>

                {/* Error Alert */}
                {error && (
                    <div style={styles.error}>
                        <AlertCircle size={16} style={{marginTop: '2px', flexShrink: 0}}/>
                        <span>{error}</span>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    {/* First Name (Register Only) */}
                    {mode === 'register' && (
                        <div style={styles.field}>
                            <label style={styles.label}>First Name</label>
                            <input
                                style={{
                                    ...styles.input,
                                    ...(focusedField === 'firstName' ? styles.inputFocus : {}),
                                }}
                                type="text"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                onFocus={() => setFocusedField('firstName')}
                                onBlur={() => setFocusedField('')}
                                placeholder="John"
                                autoComplete="given-name"
                            />
                        </div>
                    )}

                    {/* Last Name (Register Only) */}
                    {mode === 'register' && (
                        <div style={styles.field}>
                            <label style={styles.label}>Last Name</label>
                            <input
                                style={{
                                    ...styles.input,
                                    ...(focusedField === 'lastName' ? styles.inputFocus : {}),
                                }}
                                type="text"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                onFocus={() => setFocusedField('lastName')}
                                onBlur={() => setFocusedField('')}
                                placeholder="Doe"
                                autoComplete="family-name"
                            />
                        </div>
                    )}

                    {/* Email */}
                    <div style={styles.field}>
                        <label style={styles.label}>Email Address</label>
                        <input
                            style={{
                                ...styles.input,
                                ...(focusedField === 'email' ? styles.inputFocus : {}),
                            }}
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onFocus={() => setFocusedField('email')}
                            onBlur={() => setFocusedField('')}
                            placeholder="you@example.com"
                            required
                            autoComplete="email"
                        />
                    </div>

                    {/* Password */}
                    <div style={styles.field}>
                        <label style={styles.label}>Password</label>
                        <div style={styles.inputWrapper}>
                            <input
                                style={{
                                    ...styles.input,
                                    paddingRight: '40px',
                                    ...(focusedField === 'password' ? styles.inputFocus : {}),
                                }}
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onFocus={() => setFocusedField('password')}
                                onBlur={() => setFocusedField('')}
                                placeholder="••••••••"
                                required
                                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                            />
                            <button
                                type="button"
                                style={styles.eyeToggle}
                                onClick={() => setShowPassword(!showPassword)}
                                title={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                            </button>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        style={{
                            ...styles.btn,
                            ...(loading ? styles.btnDisabled : {}),
                        }}
                        disabled={loading}
                    >
                        {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
                    </button>
                </form>
            </div>
        </div>
    );
}


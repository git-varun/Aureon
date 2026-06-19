import React, {useState} from 'react';
import AuthShell from './AuthShell';
import {
    Field, Input, PasswordInput, PrimaryBtn, GhostBtn, FormError, Divider,
    GoogleIcon, AppleIcon
} from './AuthPrimitives';
import {useAuth} from '../../contexts/AuthContext';

export default function SignInScreen({onGoSignUp, onGoForgot, onGoGoogle}) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const {login} = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
        } catch (err) {
            setError(err.message || 'Sign in failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell variant="split">
            <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600}}>
                Welcome back
            </div>
            <h1 style={{margin: '8px 0 6px', fontFamily: 'var(--font-heading)', fontSize: 30, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>
                Sign in to Aureon
            </h1>
            <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 22}}>
                Enter your email and password to access your account.
            </div>

            <form onSubmit={handleSubmit}>
                <Field label="Email">
                    <Input
                        type="email" value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@domain.com" required autoFocus
                    />
                </Field>
                <Field label="Password">
                    <PasswordInput
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                    />
                </Field>
                <FormError message={error}/>
                <PrimaryBtn type="submit" loading={loading}>
                    {loading ? 'Signing in…' : 'Sign in →'}
                </PrimaryBtn>

                <div style={{textAlign: 'right', marginTop: 6}}>
                    <button type="button" onClick={onGoForgot} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--ink-40)', fontSize: 12, fontFamily: 'var(--font-ui)', padding: 0,
                    }}>
                        Forgot password?
                    </button>
                </div>

                <Divider label="or continue with"/>

                <GhostBtn type="button" onClick={onGoGoogle} style={{width: '100%'}}>
                    <GoogleIcon/> Google
                </GhostBtn>
            </form>

            <div style={{marginTop: 20, fontSize: 12.5, color: 'var(--ink-30)', textAlign: 'center'}}>
                New to Aureon?{' '}
                <button onClick={onGoSignUp} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--aurum-100)', fontSize: 12.5, fontFamily: 'var(--font-ui)', fontWeight: 500, padding: '0 4px',
                }}>
                    Create an account
                </button>
            </div>
        </AuthShell>
    );
}

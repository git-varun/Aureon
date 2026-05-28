import React, {useState} from 'react';
import AuthShell from './AuthShell';
import {Field, PrimaryBtn, FormError, BackLink, PhoneInput, OtpGrid} from './AuthPrimitives';
import {apiService} from '../../api/apiService';

function storeTokens(data) {
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
}

export default function PhoneOtpScreen({onBack, onSuccess, variant = 'split'}) {
    const [step, setStep] = useState('phone'); // 'phone' | 'otp'
    const [phone, setPhone] = useState('');
    const [digits, setDigits] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSend = async (e) => {
        e.preventDefault();
        setError('');
        if (!phone || phone.replace(/\D/g, '').length < 7) {
            setError('Enter a valid phone number.');
            return;
        }
        setLoading(true);
        try {
            await apiService.phoneOtpSend(phone);
            setStep('otp');
        } catch (err) {
            setError(err.message || 'Failed to send SMS. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        const code = digits.join('');
        if (code.length < 6) return;
        setError('');
        setLoading(true);
        try {
            const data = await apiService.phoneOtpVerify(phone, code);
            storeTokens(data);
            onSuccess(data.is_new_user ?? false);
        } catch (err) {
            setError(err.message || 'Incorrect or expired code.');
            setDigits(['', '', '', '', '', '']);
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setError('');
        setDigits(['', '', '', '', '', '']);
        try {
            await apiService.phoneOtpSend(phone);
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <AuthShell variant={variant}>
            <BackLink onClick={step === 'otp' ? () => setStep('phone') : onBack}/>
            <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600}}>
                Phone · OTP
            </div>
            <h1 style={{margin: '8px 0 6px', fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>
                {step === 'phone' ? 'Enter your phone number' : 'Enter the code'}
            </h1>
            <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 24}}>
                {step === 'phone'
                    ? "We'll send a 6-digit code via SMS."
                    : `Code sent to ${phone}. Check your messages.`}
            </div>

            {step === 'phone' ? (
                <form onSubmit={handleSend}>
                    <Field label="Phone number">
                        <PhoneInput value={phone} onChange={setPhone}/>
                    </Field>
                    <FormError message={error}/>
                    <PrimaryBtn type="submit" loading={loading}>
                        {loading ? 'Sending…' : 'Send code →'}
                    </PrimaryBtn>
                </form>
            ) : (
                <>
                    <OtpGrid values={digits} onChange={setDigits} onSubmit={handleVerify}/>
                    <FormError message={error}/>
                    <PrimaryBtn loading={loading} disabled={digits.some(v => !v)} onClick={handleVerify}>
                        {loading ? 'Verifying…' : 'Verify and continue →'}
                    </PrimaryBtn>
                    <div style={{marginTop: 14, fontSize: 12, color: 'var(--ink-40)', textAlign: 'center'}}>
                        Didn't receive it?{' '}
                        <button onClick={handleResend} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--ink-20)', fontSize: 12, fontFamily: 'var(--font-ui)', padding: '0 4px',
                        }}>Resend</button>
                    </div>
                </>
            )}
        </AuthShell>
    );
}

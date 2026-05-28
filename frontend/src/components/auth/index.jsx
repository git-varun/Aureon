/**
 * AuthFlow — multi-method auth orchestrator.
 *
 * Screens:
 *   signin    → SignInScreen (default — magic link primary + socials)
 *   signup    → SignUpScreen (name + email + region + password)
 *   forgot    → ForgotScreen
 *   magic     → MagicLinkScreen (request a magic link)
 *   google    → GoogleAuthScreen
 *   phone     → PhoneOtpScreen
 *   password  → PasswordScreen (email + password + 2FA)
 *
 * Magic link callbacks are handled at /auth/magic by App.jsx, not here.
 */
import React, {useState} from 'react';
import SignInScreen from './SignInScreen';
import SignUpScreen from './SignUpScreen';
import ForgotScreen from './ForgotScreen';
import MagicLinkScreen from './MagicLinkScreen';
import GoogleAuthScreen from './GoogleAuthScreen';
import PhoneOtpScreen from './PhoneOtpScreen';
import PasswordScreen from './PasswordScreen';

export default function AuthFlow({onLogin, initialScreen = 'signin'}) {
    const [screen, setScreen] = useState(initialScreen);

    const handleSuccess = (isNew = false) => onLogin(isNew);

    if (screen === 'signin') {
        return (
            <SignInScreen
                onGoSignUp={() => setScreen('signup')}
                onGoForgot={() => setScreen('forgot')}
                onGoGoogle={() => setScreen('google')}
                onGoPhone={() => setScreen('phone')}
                onGoPassword={() => setScreen('password')}
            />
        );
    }

    if (screen === 'signup') {
        return (
            <SignUpScreen
                onGoSignIn={() => setScreen('signin')}
                onSuccess={handleSuccess}
            />
        );
    }

    if (screen === 'forgot') {
        return <ForgotScreen onGoSignIn={() => setScreen('signin')}/>;
    }

    if (screen === 'magic') {
        return <MagicLinkScreen onBack={() => setScreen('signin')}/>;
    }

    if (screen === 'google') {
        return <GoogleAuthScreen onBack={() => setScreen('signin')} onSuccess={handleSuccess}/>;
    }

    if (screen === 'phone') {
        return <PhoneOtpScreen onBack={() => setScreen('signin')} onSuccess={handleSuccess}/>;
    }

    if (screen === 'password') {
        return <PasswordScreen onBack={() => setScreen('signin')} onSuccess={handleSuccess}/>;
    }

    return null;
}

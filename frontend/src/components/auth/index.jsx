/**
 * AuthFlow — canonical auth orchestrator.
 *
 * Screens:
 *   signin    → SignInScreen (Email + Password + Google)
 *   signup    → SignUpScreen (Invite registration)
 *   forgot    → ForgotScreen
 *   google    → GoogleAuthScreen
 */
import React, {useState} from 'react';
import SignInScreen from './SignInScreen';
import SignUpScreen from './SignUpScreen';
import ForgotScreen from './ForgotScreen';
import GoogleAuthScreen from './GoogleAuthScreen';

export default function AuthFlow({onLogin, initialScreen = 'signin'}) {
    const [screen, setScreen] = useState(initialScreen);

    const handleSuccess = (isNew = false) => onLogin(isNew);

    if (screen === 'signin') {
        return (
            <SignInScreen
                onGoSignUp={() => setScreen('signup')}
                onGoForgot={() => setScreen('forgot')}
                onGoGoogle={() => setScreen('google')}
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

    if (screen === 'google') {
        return <GoogleAuthScreen onBack={() => setScreen('signin')} onSuccess={handleSuccess}/>;
    }

    return null;
}

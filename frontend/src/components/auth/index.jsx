import React, {useState} from 'react';
import SignInScreen from './SignInScreen';
import SignUpScreen from './SignUpScreen';
import TwoFactorScreen from './TwoFactorScreen';
import ForgotScreen from './ForgotScreen';

/* Screens: 'signin' | 'signup' | 'twofa' | 'forgot' */

export default function AuthFlow({onLogin}) {
    const [screen, setScreen] = useState('signin');
    const [isNewUser, setIsNewUser] = useState(false);

    const handleSignUpDone = () => {
        setIsNewUser(true);
        setScreen('twofa');
    };

    const handleVerify = () => {
        onLogin(isNewUser);
    };

    if (screen === 'signup') {
        return <SignUpScreen onGoSignIn={() => setScreen('signin')} onDone={handleSignUpDone}/>;
    }

    if (screen === 'twofa') {
        return <TwoFactorScreen onVerify={handleVerify} onGoSignIn={() => setScreen('signin')}/>;
    }

    if (screen === 'forgot') {
        return <ForgotScreen onGoSignIn={() => setScreen('signin')}/>;
    }

    return (
        <SignInScreen
            onGoSignUp={() => setScreen('signup')}
            onGoTwoFactor={() => {
                setIsNewUser(false);
                setScreen('twofa');
            }}
            onGoForgot={() => setScreen('forgot')}
        />
    );
}

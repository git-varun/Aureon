/* Top-level router: onboarding → Aureon shell. No auth — single-user app. */
import React from 'react';
import {Toaster} from 'react-hot-toast';
import './styles/aureon/tokens.css';
import './styles/aureon/colors_and_type.css';
import './styles/aureon/shell.css';
import AureonShell from './AureonShell';
import Onboarding from './pages/aureon/Onboarding';

export default function App() {
    const onboarded = !!localStorage.getItem('aureon.onboarded');

    const handleOnboardingDone = () => {
        localStorage.setItem('aureon.onboarded', 'true');
        window.location.reload();
    };

    const shell = !onboarded
        ? <Onboarding onDone={handleOnboardingDone}/>
        : <AureonShell onLogout={() => {}} userName=""/>;

    return (
        <>
            {shell}
            <Toaster position="top-right" toastOptions={{
                style: {
                    background: '#16181c',
                    color: '#E4E7ED',
                    border: '1px solid rgba(255,255,255,0.10)'
                }
            }}/>
        </>
    );
}

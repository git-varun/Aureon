import React from 'react';
import {AuthBrand, AuthLegal, AuthBrandPanel} from './AuthPrimitives';

export default function AuthShell({variant = 'split', children}) {
    if (variant === 'centered') {
        return (
            <div style={{
                minHeight: '100vh', background: 'var(--canvas)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
                backgroundImage: 'radial-gradient(900px 500px at 50% -200px, rgba(201,168,106,0.10), transparent 60%)',
            }}>
                <div style={{width: 'min(440px, 100%)'}}>
                    <AuthBrand center/>
                    <div style={{
                        padding: '28px 28px 22px',
                        marginTop: 18,
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 14
                    }}>
                        {children}
                    </div>
                    <AuthLegal/>
                </div>
            </div>
        );
    }

    if (variant === 'editorial') {
        return (
            <div style={{
                minHeight: '100vh', background: 'var(--canvas)',
                display: 'flex', flexDirection: 'column', padding: '48px 64px',
                backgroundImage: 'radial-gradient(1200px 700px at 80% 20%, rgba(201,168,106,0.08), transparent 60%)',
            }}>
                <AuthBrand/>
                <div style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: '1.1fr 1fr',
                    gap: 80,
                    alignItems: 'center',
                    marginTop: 24
                }}>
                    <div>
                        <div style={{
                            fontFamily: 'var(--font-heading)',
                            fontSize: 64,
                            fontWeight: 600,
                            color: 'var(--ink-00)',
                            letterSpacing: '-0.025em',
                            lineHeight: 1.04
                        }}>
                            What should you do next with your capital?
                        </div>
                        <div style={{
                            color: 'var(--ink-30)',
                            fontSize: 16,
                            marginTop: 22,
                            maxWidth: 520,
                            lineHeight: 1.55
                        }}>
                            Aureon unifies your stocks, mutual funds, EPF, NPS and crypto into a single decision layer.
                            One question, one screen.
                        </div>
                    </div>
                    <div style={{maxWidth: 420}}>{children}</div>
                </div>
            </div>
        );
    }

    // split (default)
    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--canvas)',
            display: 'grid',
            gridTemplateColumns: 'minmax(420px, 1fr) 1.1fr'
        }}>
            <div style={{padding: '40px 56px', display: 'flex', flexDirection: 'column'}}>
                <AuthBrand/>
                <div style={{flex: 1, display: 'flex', alignItems: 'center'}}>
                    <div style={{width: '100%', maxWidth: 380}}>
                        {children}
                    </div>
                </div>
                <AuthLegal/>
            </div>
            <AuthBrandPanel/>
        </div>
    );
}

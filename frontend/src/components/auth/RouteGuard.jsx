import React from 'react';
import {Navigate, useLocation} from 'react-router-dom';
import {useAuth} from '../../contexts/AuthContext';
import {useOrganization} from '../../contexts/OrganizationContext';
import {usePortfolio} from '../../contexts/PortfolioContext';

const btnStyle = {
    padding: '8px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
    fontFamily: 'var(--font-ui)', border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)', color: 'var(--ink-10)',
};

export const RouteGuard = ({children, requiredRole, allowNoOrg = false}) => {
    const {isAuthenticated, loading: authLoading, logout} = useAuth();
    const {activeOrgId, membershipRole, loading: orgLoading} = useOrganization();
    const {activePortfolioId, loading: portLoading} = usePortfolio();
    const location = useLocation();

    if (authLoading) {
        return (
            <div style={{display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--canvas)', color: 'var(--ink-40)'}}>
                Authenticating…
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{from: location}} replace />;
    }

    if (orgLoading || portLoading) {
        return (
            <div style={{display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--canvas)', color: 'var(--ink-40)'}}>
                Resolving tenant contexts…
            </div>
        );
    }

    if (!activeOrgId && !allowNoOrg) {
        return (
            <div style={{display: 'flex', height: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--canvas)', color: 'var(--ink-20)', padding: 24, gap: 16}}>
                <h3 style={{color: 'var(--ink-00)', fontSize: 18, margin: 0}}>No active organization</h3>
                <p style={{color: 'var(--ink-40)', fontSize: 13, margin: 0}}>Please accept an invitation or create an organization to proceed.</p>
                <div style={{display: 'flex', gap: 10, marginTop: 8}}>
                    <button style={btnStyle} onClick={() => {
                        localStorage.removeItem('aureon.onboarded');
                        window.location.reload();
                    }}>Restart Onboarding</button>
                    <button style={btnStyle} onClick={() => logout()}>Sign Out</button>
                </div>
            </div>
        );
    }

    // Settings screens don't require an active portfolio, but main screens do
    if (!activePortfolioId && !allowNoOrg && !location.pathname.startsWith('/settings')) {
        return (
            <div style={{display: 'flex', height: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--canvas)', color: 'var(--ink-20)', padding: 24, gap: 16}}>
                <h3 style={{color: 'var(--ink-00)', fontSize: 18, margin: 0}}>No active portfolio</h3>
                <p style={{color: 'var(--ink-40)', fontSize: 13, margin: 0}}>Please create a portfolio inside your organization to proceed.</p>
                <div style={{display: 'flex', gap: 10, marginTop: 8}}>
                    <button style={btnStyle} onClick={() => {
                        localStorage.removeItem('aureon.onboarded');
                        window.location.reload();
                    }}>Restart Onboarding</button>
                    <button style={btnStyle} onClick={() => logout()}>Sign Out</button>
                </div>
            </div>
        );
    }

    if (requiredRole && requiredRole.length > 0) {
        const hasRole = requiredRole.includes(membershipRole);
        if (!hasRole) {
            return (
                <div style={{display: 'flex', height: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--canvas)', color: 'var(--crimson-500)', padding: 24}}>
                    <h3 style={{fontSize: 18}}>Access Denied</h3>
                    <p style={{color: 'var(--ink-40)', fontSize: 13, marginTop: 4}}>You do not have the required permissions ({requiredRole.join(', ')}) to access this page.</p>
                </div>
            );
        }
    }

    return children;
};

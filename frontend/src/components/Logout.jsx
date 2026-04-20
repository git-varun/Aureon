import React, {useState} from 'react';
import {LogOut, AlertCircle} from 'lucide-react';
import {apiService} from '../api/apiService';
import toast from 'react-hot-toast';

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    dialog: {
        background: '#131722',
        border: '1px solid #1E222D',
        borderRadius: '8px',
        padding: '32px',
        width: '100%',
        maxWidth: '360px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '20px',
    },
    iconBox: {
        width: '40px',
        height: '40px',
        backgroundColor: 'rgba(242, 54, 69, 0.1)',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#F23645',
    },
    title: {
        color: '#D1D4DC',
        fontSize: '18px',
        fontWeight: '600',
        margin: 0,
    },
    message: {
        color: '#787B86',
        fontSize: '14px',
        lineHeight: '1.6',
        margin: '0 0 24px',
    },
    userInfo: {
        background: '#0B0E14',
        border: '1px solid #1E222D',
        borderRadius: '4px',
        padding: '12px',
        marginBottom: '24px',
    },
    userEmail: {
        color: '#D1D4DC',
        fontSize: '13px',
        margin: 0,
    },
    userLabel: {
        color: '#787B86',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        margin: '0 0 4px',
        fontWeight: '600',
    },
    buttons: {
        display: 'flex',
        gap: '12px',
    },
    btn: {
        flex: 1,
        padding: '12px',
        borderRadius: '4px',
        border: 'none',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
        letterSpacing: '0.3px',
    },
    btnLogout: {
        background: '#F23645',
        color: '#fff',
    },
    btnLogoutHover: {
        opacity: 0.9,
    },
    btnCancel: {
        background: '#1E222D',
        color: '#787B86',
        border: '1px solid #2A2E39',
    },
    btnCancelHover: {
        background: '#1E222D',
        color: '#D1D4DC',
    },
    btnDisabled: {
        opacity: 0.6,
        cursor: 'not-allowed',
    },
};

export default function Logout({isOpen, onClose, onLogout}) {
    const [loading, setLoading] = useState(false);
    const [hover, setHover] = useState('');

    const userEmail = localStorage.getItem('user_email') || 'user@example.com';
    const userName = localStorage.getItem('user_name') || 'User';

    const handleLogout = async () => {
        setLoading(true);
        try {
            const refreshToken = localStorage.getItem('refresh_token');
            if (refreshToken) {
                await apiService.logout(refreshToken);
            }

            // Clear storage
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user_id');
            localStorage.removeItem('user_email');
            localStorage.removeItem('user_name');

            toast.success('Logged out successfully');
            onClose();
            onLogout();
        } catch (err) {
            toast.error('Logout failed. You can still refresh to clear session.');
            console.error('Logout error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <div style={styles.iconBox}>
                        <LogOut size={20}/>
                    </div>
                    <h2 style={styles.title}>Sign Out</h2>
                </div>

                {/* Message */}
                <p style={styles.message}>
                    Are you sure you want to sign out? You'll need to log back in to access your portfolio.
                </p>

                {/* User Info */}
                <div style={styles.userInfo}>
                    <div style={styles.userLabel}>Signed in as:</div>
                    <p style={styles.userEmail}>{userEmail}</p>
                </div>

                {/* Buttons */}
                <div style={styles.buttons}>
                    <button
                        style={{
                            ...styles.btn,
                            ...styles.btnCancel,
                            ...(hover === 'cancel' ? styles.btnCancelHover : {}),
                        }}
                        onMouseEnter={() => setHover('cancel')}
                        onMouseLeave={() => setHover('')}
                        onClick={onClose}
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        style={{
                            ...styles.btn,
                            ...styles.btnLogout,
                            ...(loading ? styles.btnDisabled : {}),
                            ...(hover === 'logout' ? styles.btnLogoutHover : {}),
                        }}
                        onMouseEnter={() => !loading && setHover('logout')}
                        onMouseLeave={() => setHover('')}
                        onClick={handleLogout}
                        disabled={loading}
                    >
                        {loading ? 'Signing Out…' : 'Sign Out'}
                    </button>
                </div>
            </div>
        </div>
    );
}


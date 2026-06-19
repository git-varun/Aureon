import React, {createContext, useContext, useState, useEffect} from 'react';
import {apiService} from '../api/apiService';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        return {
            user: null,
            isAuthenticated: false,
            loading: true,
            login: async () => {},
            loginGoogle: async () => {},
            logout: async () => {},
            restoreSession: async () => {}
        };
    }
    return context;
};

export const AuthProvider = ({children}) => {
    const [user, setUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('access_token'));
    const [loading, setLoading] = useState(true);

    const restoreSession = async () => {
        const token = localStorage.getItem('access_token');
        if (!token) {
            setLoading(false);
            return;
        }
        try {
            const userData = await apiService.getCurrentUser();
            setUser(userData);
            setIsAuthenticated(true);
        } catch (err) {
            console.error('Failed to restore session:', err);
            // Session expired or invalid
            localStorage.removeItem('access_token');
            localStorage.removeItem('user_first_name');
            setUser(null);
            setIsAuthenticated(false);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        restoreSession();

        const handleForceLogout = () => {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user_first_name');
            setUser(null);
            setIsAuthenticated(false);
        };

        window.addEventListener('auth:logout', handleForceLogout);
        return () => window.removeEventListener('auth:logout', handleForceLogout);
    }, []);

    const login = async (email, password) => {
        setLoading(true);
        try {
            const data = await apiService.loginPassword(email, password);
            const token = data.session.session_token;
            localStorage.setItem('access_token', token);
            localStorage.setItem('user_first_name', data.user.first_name || '');
            setUser(data.user);
            setIsAuthenticated(true);
            return data;
        } catch (err) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user_first_name');
            setUser(null);
            setIsAuthenticated(false);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const loginGoogle = async (idToken) => {
        setLoading(true);
        try {
            const data = await apiService.googleAuth(idToken);
            const token = data.session.session_token;
            localStorage.setItem('access_token', token);
            localStorage.setItem('user_first_name', data.user.first_name || '');
            setUser(data.user);
            setIsAuthenticated(true);
            return data;
        } catch (err) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user_first_name');
            setUser(null);
            setIsAuthenticated(false);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        setLoading(true);
        try {
            await apiService.logout();
        } catch (err) {
            console.warn('Logout request failed:', err);
        } finally {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user_first_name');
            setUser(null);
            setIsAuthenticated(false);
            setLoading(false);
        }
    };

    return (
        <AuthContext.Provider value={{user, isAuthenticated, loading, login, loginGoogle, logout, restoreSession}}>
            {children}
        </AuthContext.Provider>
    );
};

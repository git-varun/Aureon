import React from 'react';
import {useApp} from '../store';
import s from './Toast.module.css';

export const Toast = () => {
    const {toast, setToast} = useApp();
    if (!toast) return null;
    return (
        <div className={s.toast}>
            <span className={s.icon}>✓</span>
            <span className={s.text}>{toast.text}</span>
            <button onClick={() => {toast.undo?.(); setToast(null);}} className="du3-cta">Undo</button>
            <button onClick={() => setToast(null)} className="du3-cta ghost" style={{padding: '0 8px'}}>✕</button>
        </div>
    );
};

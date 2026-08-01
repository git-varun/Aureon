import {useEffect} from 'react';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* Escape-to-close, Tab focus trap, body-scroll lock, and focus restore on
   close — shared by every overlay (ds.jsx's ModalShell/Drawer, CommandPalette,
   etc.) so a fix here covers all of them instead of being solved per-component. */
export const useOverlayA11y = (open, onClose, panelRef) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (e.key !== 'Tab') return;
            const panel = panelRef.current;
            if (!panel) return;
            const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR));
            if (focusable.length === 0) { e.preventDefault(); return; }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose, panelRef]);

    useEffect(() => {
        if (!open) return;
        const prevOverflow = document.body.style.overflow;
        const prevFocused = document.activeElement;
        document.body.style.overflow = 'hidden';
        panelRef.current?.focus();
        return () => {
            document.body.style.overflow = prevOverflow;
            if (prevFocused instanceof HTMLElement) prevFocused.focus();
        };
    }, [open]);
};

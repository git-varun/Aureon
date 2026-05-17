import React, {useEffect, useRef, useState} from 'react';
import {useV4} from '../../../contexts/V4Context';
import {SUPPORTED_CURRENCIES, CURRENCY_META} from '../../../pages/aureon/marketData';
import {I} from './icons.jsx';
import s from './CurrencyMenu.module.css';

export const CurrencyMenu = () => {
    const {currency, setCurrency} = useV4();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const meta = CURRENCY_META[currency] || CURRENCY_META.INR;

    return (
        <div ref={ref} style={{position: 'relative'}}>
            <button
                onClick={() => setOpen(o => !o)}
                aria-label="Display currency"
                className={`${s.trigger}${open ? ' ' + s.triggerOpen : ''}`}
            >
                <span className={s.triggerSymbol}>{meta.symbol}</span>
                <span className={s.triggerCode}>{meta.code}</span>
                <span className={`${s.chevron}${open ? ' ' + s.chevronOpen : ''}`}>{I.chevronDown}</span>
            </button>

            {open && (
                <div className={s.dropdown}>
                    <div className={s.dropdownLabel}>Display currency</div>
                    {SUPPORTED_CURRENCIES.map(code => {
                        const m = CURRENCY_META[code];
                        const isActive = code === currency;
                        return (
                            <button
                                key={code}
                                onClick={() => { setCurrency(code); setOpen(false); }}
                                className={`${s.option}${isActive ? ' ' + s.optionActive : ''}`}
                            >
                                <span className={s.optionSymbol}>{m.symbol}</span>
                                <span className={s.optionInfo}>
                                    <span className={s.optionCode}>{m.code}</span>
                                    <span className={s.optionName}>{m.name}</span>
                                </span>
                                {isActive && <span className={s.optionCheck}>✓</span>}
                            </button>
                        );
                    })}
                    <div className={s.footer}>
                        Converts all values at the presentation layer. Source currency is preserved internally.
                    </div>
                </div>
            )}
        </div>
    );
};

import React, {useState} from 'react';
import {Empty} from '../ui';
import s from './PortfolioProgress.module.css';

export const PortfolioProgress = () => {
    const [open, setOpen] = useState(false);
    return (
        <section className={s.section}>
            <button onClick={() => setOpen(o => !o)} className={s.toggle}>
                <div className={s.titleGroup}>
                    <span className={s.iconWrap}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 17 9 11 13 15 21 7"/>
                            <polyline points="14 7 21 7 21 14"/>
                        </svg>
                    </span>
                    <div>
                        <div className={s.title}>Portfolio progress</div>
                        <div className={s.subtitle}>Net worth trend · allocation evolution · vs benchmark</div>
                    </div>
                </div>
                <div className={s.spacer}/>
                <span className={`${s.chevron}${open ? ' ' + s.chevronOpen : ''}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </span>
            </button>

            {open && (
                <div className={s.body}>
                    <Empty>Historical data unavailable — run the daily pipeline to populate trend data</Empty>
                </div>
            )}
        </section>
    );
};

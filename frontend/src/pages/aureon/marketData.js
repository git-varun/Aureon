/* Aureon — formatter utilities shared across Markets, Terminal, Watchlist, etc. */

const FX_PER_INR = { INR: 1, USD: 1 / 83.2, EUR: 1 / 90.6, GBP: 1 / 105.4, AED: 1 / 22.65, JPY: 1.78 };

export const CURRENCY_META = {
    INR: { code: 'INR', symbol: '₹',   name: 'Indian Rupee',   locale: 'en-IN', dp: 2 },
    USD: { code: 'USD', symbol: '$',    name: 'US Dollar',      locale: 'en-US', dp: 2 },
    EUR: { code: 'EUR', symbol: '€',    name: 'Euro',           locale: 'en-DE', dp: 2 },
    GBP: { code: 'GBP', symbol: '£',    name: 'Pound Sterling', locale: 'en-GB', dp: 2 },
    AED: { code: 'AED', symbol: 'د.إ',  name: 'UAE Dirham',     locale: 'en-AE', dp: 2 },
    JPY: { code: 'JPY', symbol: '¥',    name: 'Japanese Yen',   locale: 'ja-JP', dp: 0 },
};

export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'JPY'];

export const getActiveCurrency = () => {
    const c = typeof window !== 'undefined' ? window.__aureonCurrency : undefined;
    return SUPPORTED_CURRENCIES.includes(c) ? c : 'INR';
};

const getRate = (from, to) => FX_PER_INR[to] / FX_PER_INR[from];

export const fmtMoney = (n, sourceCcy = 'INR', opts = {}) => {
    const toCcy = getActiveCurrency();
    const converted = n * getRate(sourceCcy, toCcy);
    const m = CURRENCY_META[toCcy];
    const sign = converted < 0 ? '−' : '';
    const a = Math.abs(converted);
    const dp = opts.dp ?? m.dp;

    if (opts.compact) {
        if (toCcy === 'INR') {
            if (a >= 1e7) return sign + m.symbol + (a / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
            if (a >= 1e5) return sign + m.symbol + (a / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' L';
            if (a >= 1e3) return sign + m.symbol + (a / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'K';
        } else if (toCcy === 'JPY') {
            if (a >= 1e9) return sign + m.symbol + Math.round(a / 1e9) + 'B';
            if (a >= 1e6) return sign + m.symbol + Math.round(a / 1e6) + 'M';
            if (a >= 1e3) return sign + m.symbol + Math.round(a / 1e3) + 'K';
        } else {
            if (a >= 1e9) return sign + m.symbol + (a / 1e9).toFixed(2) + 'B';
            if (a >= 1e6) return sign + m.symbol + (a / 1e6).toFixed(1) + 'M';
            if (a >= 1e3) return sign + m.symbol + (a / 1e3).toFixed(1) + 'K';
        }
    }
    return sign + m.symbol + a.toLocaleString(m.locale, { minimumFractionDigits: dp, maximumFractionDigits: dp });
};

export const fmtINR = (n, opts = {}) => fmtMoney(n, 'INR', opts);
export const fmtUSD = (n, opts = {}) => fmtMoney(n, 'USD', opts);

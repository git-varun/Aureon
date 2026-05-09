/* Aureon — formatter utilities shared across Markets, Terminal, Watchlist. */

export const fmtINR = (n, opts = {}) => {
    const sign = n < 0 ? '−' : '';
    const a = Math.abs(n);
    if (opts.compact) {
        if (a >= 1e7) return sign + '₹' + (a / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
        if (a >= 1e5) return sign + '₹' + (a / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' L';
        if (a >= 1e3) return sign + '₹' + (a / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'K';
    }
    return sign + '₹' + a.toLocaleString('en-IN', {maximumFractionDigits: opts.dp ?? 2, minimumFractionDigits: opts.dp ?? 2});
};

export const fmtUSD = (n, opts = {}) => {
    const sign = n < 0 ? '−' : '';
    const a = Math.abs(n);
    if (opts.compact) {
        if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(2) + 'B';
        if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(1) + 'M';
        if (a >= 1e3) return sign + '$' + (a / 1e3).toFixed(1) + 'K';
    }
    return sign + '$' + a.toLocaleString('en-US', {maximumFractionDigits: opts.dp ?? 2, minimumFractionDigits: opts.dp ?? 2});
};

export const genSeries = (seed, base, len = 30, vol = 0.018, drift = 0) => {
    let v = base, h = 0;
    const out = [];
    for (let i = 0; i < len; i++) {
        h = (h * 1664525 + seed.charCodeAt(i % seed.length) + 1013904223) >>> 0;
        const r = (h / 0xffffffff - 0.5) * 2 * vol + drift;
        v = v * (1 + r);
        out.push(v);
    }
    return out;
};

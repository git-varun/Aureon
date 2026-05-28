/* Reactive money formatter — reads currency and live FX rates from V4Context. */
import { useV4 } from '../contexts/V4Context';
import { fmtMoneyWith } from '../pages/aureon/marketData';

export const useFmtMoney = () => {
    const { currency, fxRates } = useV4();
    return (n, sourceCcy = 'INR', opts = {}) => fmtMoneyWith(n, sourceCcy, currency, fxRates, opts);
};

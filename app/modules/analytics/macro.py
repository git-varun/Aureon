class FearGreedProvider:
    """Fetches Crypto Fear & Greed Index from alternative.me API."""

    @property
    def provider_name(self) -> str:
        return "FearGreed"

    def fetch(self) -> Dict:
        """Fetch and cache Fear & Greed data."""
        cache_key = "global_fear_greed"
        cached = smart_cache.get(cache_key)
        if cached:
            return cached

        try:
            res = requests.get("https://api.alternative.me/fng/?limit=1", timeout=5).json()
            data = res['data'][0]
            result = {
                "value": int(data['value']),
                "classification": data['value_classification']
            }
            smart_cache.set(cache_key, result, expire=TTL_ALT_DATA)
            return result
        except Exception as e:
            logger.debug(f"Fear & Greed fetch failed: {e}")
            return {"value": 50, "classification": "Neutral"}


class DXYProvider:
    """Fetches US Dollar Index (DXY) as FII flow proxy."""

    @property
    def provider_name(self) -> str:
        return "DXY"

    def fetch(self) -> Dict:
        """Fetch and cache DXY data."""
        cache_key = "global_dxy_data"
        cached = smart_cache.get(cache_key)
        if cached:
            return cached

        try:
            dxy_ticker = yf.Ticker("DX-Y.NYB")
            current_dxy = dxy_ticker.fast_info['last_price']
            prev_close = dxy_ticker.fast_info['previous_close']

            trend = "RISING (Liquidity Drain from India)" if current_dxy > prev_close else "FALLING (Liquidity Flowing into India)"

            result = {
                "dxy_value": round(current_dxy, 2),
                "fii_trend": trend
            }
            smart_cache.set(cache_key, result, expire=TTL_ALT_DATA)
            return result
        except Exception as e:
            logger.debug(f"DXY fetch failed: {e}")
            return {"dxy_value": 104.00, "fii_trend": "UNKNOWN"}


class MacroIndicatorProvider:
    """Fetches macro indicators: Brent, US 10Y Yield, VIX."""

    @property
    def provider_name(self) -> str:
        return "MacroIndicators"

    def fetch(self) -> Dict:
        """Fetch and cache macro indicators."""
        cache_key = "global_macro_indicators"
        cached = smart_cache.get(cache_key)
        if cached:
            return cached

        try:
            import pandas as pd
            macro_df = yf.download("BZ=F ^TNX ^INDIAVIX", period="5d", progress=False)['Close']
            if isinstance(macro_df.columns, pd.MultiIndex):
                macro_df.columns = macro_df.columns.get_level_values(0)

            def _last(col):
                s = macro_df.get(col)
                if s is None or (hasattr(s, 'dropna') and s.dropna().empty):
                    return 0.0
                return float(s.dropna().iloc[-1])

            result = {
                "brent_crude": round(_last('BZ=F'), 2),
                "us_10y_yield": round(_last('^TNX'), 2),
                "india_vix": round(_last('^INDIAVIX'), 2)
            }
            smart_cache.set(cache_key, result, expire=TTL_ALT_DATA)
            return result
        except Exception as e:
            logger.debug(f"Macro indicators fetch failed: {e}")
            return {"brent_crude": 0.0, "us_10y_yield": 0.0, "india_vix": 0.0}

"""Curated, live-verified constituent lists for the 6 index-based tracked
universes (Phase D). Each equity list below was resolved live against its
primary provider during the Phase D investigation/build — not taken from
index-provider marketing pages — and is a representative subset of the named
index (index membership shifts over time and free data sources don't expose
official constituent lists), same "point-in-time curated" caveat as this
codebase's other static symbol lists (e.g. market.py's theme symbol lists).

Crypto has no static list here — see CoinGeckoAdapter.get_top_market_cap_coins,
called live at seed time instead (Phase D investigation found a single
/coins/markets call can return the full top 100, unlike these 5 equity
indices which have no equivalent single-call discovery endpoint on a free
data source).
"""

INDIA_NIFTY100 = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "ICICIBANK.NS", "INFY.NS",
    "HINDUNILVR.NS", "ITC.NS", "SBIN.NS", "BHARTIARTL.NS", "BAJFINANCE.NS",
    "KOTAKBANK.NS", "LT.NS", "HCLTECH.NS", "ASIANPAINT.NS", "AXISBANK.NS",
    "MARUTI.NS", "SUNPHARMA.NS", "TITAN.NS", "ULTRACEMCO.NS", "WIPRO.NS",
    "NESTLEIND.NS", "ONGC.NS", "NTPC.NS", "POWERGRID.NS", "M&M.NS",
    "TMPV.NS", "TATASTEEL.NS", "ADANIENT.NS", "ADANIPORTS.NS", "JSWSTEEL.NS",
    "COALINDIA.NS", "BAJAJFINSV.NS", "HDFCLIFE.NS", "SBILIFE.NS", "GRASIM.NS",
    "TECHM.NS", "DRREDDY.NS", "CIPLA.NS", "EICHERMOT.NS", "BRITANNIA.NS",
    "DIVISLAB.NS", "HEROMOTOCO.NS", "APOLLOHOSP.NS", "BPCL.NS", "INDUSINDBK.NS",
    "TATACONSUM.NS", "HINDALCO.NS", "UPL.NS", "SHREECEM.NS", "BAJAJ-AUTO.NS",
    "DLF.NS", "SIEMENS.NS", "PIDILITIND.NS", "GODREJCP.NS", "VEDL.NS",
    "BANKBARODA.NS", "AMBUJACEM.NS", "DABUR.NS", "HAVELLS.NS", "ICICIPRULI.NS",
    "MARICO.NS", "SRF.NS", "TORNTPHARM.NS", "PAGEIND.NS", "IOC.NS",
    "GAIL.NS", "PNB.NS", "TVSMOTOR.NS", "BOSCHLTD.NS",
    "COLPAL.NS", "MOTHERSON.NS", "CANBK.NS", "NAUKRI.NS", "INDIGO.NS",
    "LUPIN.NS", "MUTHOOTFIN.NS", "PIIND.NS", "BERGEPAINT.NS", "ABB.NS",
    "ETERNAL.NS",
]
# TATAMOTORS.NS -> TMPV.NS: live-tested empty even at 5y history — Tata Motors
# demerged into passenger/commercial vehicle entities; TMPV.NS (Tata Motors
# Passenger Vehicles) is the real live successor. ZOMATO.NS -> ETERNAL.NS:
# live-tested empty — Zomato's 2024 corporate rebrand to Eternal Ltd.

# MMC (Marsh & McLennan) dropped — live-tested empty at 5d/1mo history despite
# being a real, currently-listed S&P 100 company; not a symbol-format issue
# (bare US ticker, same shape as every other entry here) — left out rather
# than guessed at, per no-fake-data.
US_SP100 = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "JPM", "V",
    "UNH", "XOM", "JNJ", "WMT", "PG", "MA", "HD", "CVX", "MRK", "LLY",
    "ABBV", "PEP", "KO", "COST", "AVGO", "BAC", "TMO", "MCD", "CSCO", "ACN",
    "ABT", "DHR", "NFLX", "ADBE", "CRM", "TXN", "NKE", "LIN", "WFC", "DIS",
    "PM", "VZ", "CMCSA", "ORCL", "AMD", "INTC", "IBM", "QCOM", "HON", "UPS",
    "BA", "CAT", "GE", "GS", "MS", "AMGN", "SBUX", "LOW", "SPGI", "BLK",
    "PLD", "INTU", "AXP", "DE", "MDT", "GILD", "T", "C", "ELV", "SYK",
    "ADI", "BKNG", "TJX", "CI", "SCHW", "MO", "REGN", "ZTS", "SO",
    "ISRG", "PGR", "VRTX", "CB", "DUK", "BMY", "USB", "PNC", "FDX", "EMR",
    "AON", "APD", "GM", "F", "COP", "TGT", "MU", "PYPL", "NEM", "KHC",
]

# .T = Tokyo Stock Exchange. 9613.T dropped — live-tested empty at 5y history
# (wrong/delisted symbol, not a real coverage gap; see Phase D investigation).
JAPAN_TOPIX100 = [
    "7203.T", "6758.T", "9984.T", "9432.T", "8306.T", "6861.T", "6098.T", "9433.T", "4063.T", "6501.T",
    "7267.T", "8035.T", "4519.T", "4502.T", "6752.T", "6902.T", "7741.T", "6273.T", "6367.T", "5108.T",
    "9020.T", "9022.T", "2914.T", "4568.T", "8801.T", "8802.T", "8058.T", "8031.T", "8001.T", "8053.T",
    "6702.T", "6503.T", "7011.T", "7201.T", "7269.T", "5401.T", "5713.T", "5411.T", "3382.T", "9983.T",
    "6178.T", "8316.T", "8411.T", "8604.T", "4523.T", "4507.T", "4901.T", "3407.T", "5019.T",
    "9503.T", "9501.T", "9531.T", "4755.T", "2802.T", "2502.T", "2503.T", "3402.T", "6971.T",
    "6981.T", "6674.T", "7733.T", "7751.T", "7013.T", "5802.T", "5711.T", "1605.T", "1928.T", "1801.T",
]

# .HK = Hong Kong Stock Exchange. 0011.HK dropped — live-tested empty at 5y
# history (wrong/delisted symbol, not a real coverage gap).
HONG_KONG_HSI = [
    "0700.HK", "0005.HK", "9988.HK", "3690.HK", "1299.HK", "0388.HK", "0941.HK", "2318.HK", "1810.HK", "9618.HK",
    "0016.HK", "0002.HK", "0003.HK", "0006.HK", "0012.HK", "0017.HK", "0027.HK", "0066.HK", "0083.HK",
    "0101.HK", "0175.HK", "0241.HK", "0267.HK", "0288.HK", "0386.HK", "0669.HK", "0688.HK", "0762.HK", "0823.HK",
    "0836.HK", "0857.HK", "0868.HK", "0881.HK", "0883.HK", "0939.HK", "0960.HK", "0968.HK", "0981.HK", "0992.HK",
    "1038.HK", "1044.HK", "1088.HK", "1093.HK", "1109.HK", "1113.HK", "1177.HK", "1211.HK", "1288.HK", "1398.HK",
    "1876.HK", "1928.HK", "1929.HK", "1997.HK", "2007.HK", "2020.HK", "2269.HK", "2313.HK", "2331.HK", "2359.HK",
    "2382.HK", "2628.HK", "3328.HK", "3968.HK", "3988.HK", "6098.HK", "6862.HK", "9633.HK", "9888.HK", "9999.HK",
]

# STOXX Europe 100 spans ~15 exchanges (.DE .PA .AS .MI .MC .ST .CO .HE .BR
# .LS .VI .OL .SW .L) — live-tested per-exchange in Phase D. ROG.SW dropped
# (live-tested empty at 5y history — wrong ticker, not a real gap).
EUROPE_STOXX100 = [
    "ASML.AS", "SAP.DE", "MC.PA", "NESN.SW", "NOVN.SW", "SIE.DE", "OR.PA", "TTE.PA", "SAN.PA",
    "AIR.PA", "AI.PA", "DTE.DE", "ALV.DE", "BAS.DE", "BAYN.DE", "BMW.DE", "VOW3.DE", "ADS.DE", "MBG.DE",
    "IBE.MC", "ITX.MC", "SAN.MC", "BBVA.MC", "TEF.MC", "REP.MC", "FER.MC", "AMS.MC",
    "ENEL.MI", "ENI.MI", "ISP.MI", "UCG.MI", "G.MI", "RACE.MI", "STLAM.MI",
    "ABI.BR", "UCB.BR", "KBC.BR",
    "EQNR.OL", "DNB.OL", "NHY.OL",
    "ATCO-A.ST", "VOLV-B.ST", "ERIC-B.ST", "HM-B.ST", "SEB-A.ST", "SAND.ST",
    "NOVO-B.CO", "MAERSK-B.CO", "DSV.CO", "ORSTED.CO",
    "NOKIA.HE", "SAMPO.HE",
    "GALP.LS", "EDP.LS",
    "OMV.VI", "VOE.VI",
    "SHEL.L", "AZN.L", "HSBA.L", "ULVR.L", "BP.L", "GSK.L", "DGE.L", "RIO.L", "BATS.L", "VOD.L",
    "LLOY.L", "BARC.L", "NG.L", "REL.L", "LSEG.L", "PRU.L", "GLEN.L", "AAL.L", "III.L", "FLTR.L",
]

SEED_UNIVERSES: dict[str, list[str]] = {
    "india_nifty100": INDIA_NIFTY100,
    "us_sp100": US_SP100,
    "japan_topix100": JAPAN_TOPIX100,
    "hongkong_hsi": HONG_KONG_HSI,
    "europe_stoxx100": EUROPE_STOXX100,
}

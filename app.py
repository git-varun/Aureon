from dotenv import load_dotenv

load_dotenv()

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import yfinance as yf
from engine import InvestmentEngine

st.set_page_config(page_title="Investment OS 4.0 Pro", page_icon="🏛️", layout="wide")


@st.cache_resource
def load_engine(): return InvestmentEngine()


engine = load_engine()


@st.cache_data(ttl=3600)
def fetch_historical_data(symbol):
    """Fetches historical data and calculates standard institutional moving averages."""
    try:
        df = yf.download(symbol, period="1y", interval="1d", progress=False)
        if isinstance(df.columns, pd.MultiIndex): df.columns = df.columns.get_level_values(0)

        if not df.empty:
            df['SMA50'] = df['Close'].rolling(window=50).mean()
            df['SMA200'] = df['Close'].rolling(window=200).mean()
        return df
    except:
        return pd.DataFrame()


# --- INSTANT CACHE LOAD ON BOOT ---
if 'initialized' not in st.session_state:
    assets, health, briefing, fx = engine.load_system_state()
    st.session_state.update(assets=assets or [], health=health or {}, briefing=briefing, fx=fx or 83.50)
    st.session_state.initialized = True

# --- TERMINAL CONTROLS ---
st.sidebar.title("⚙️ Terminal Controls")

if st.sidebar.button("🔄 1. Sync Brokers (Groww/Binance)"):
    with st.spinner("Connecting to Binance/Groww..."):
        engine.sync_portfolio(force_refresh=True)
    st.sidebar.success("Database Updated! Proceed to Step 2.")

# MERGED BUTTON: Prices, News, Math, and AI run concurrently
if st.sidebar.button("🧠 2. Run Full Intelligence Pipeline", type="primary"):
    with st.spinner("Executing Full Institutional Pipeline (Valuation, Scrape, AI)..."):
        raw_assets = engine.sync_portfolio(force_refresh=False)
        assets, total_val, fx = engine.enrich_portfolio(raw_assets)
        health = engine.portfolio_math.analyze_health(assets, total_val)
        briefing = engine.generate_alpha_briefing(assets, total_val)

        engine.save_system_state(assets, health, briefing, fx)
        st.session_state.update(assets=assets, health=health, briefing=briefing, fx=fx)
    st.rerun()

st.title("🏛️ Investment OS: Institutional Terminal")

assets = st.session_state.assets
if not assets:
    st.info("👈 System empty. Click '1. Sync Brokers' to begin.")
    st.stop()

total_val = sum(a.get('value_inr', 0) for a in assets)
fx = st.session_state.fx
briefing = st.session_state.briefing
health = st.session_state.health

# --- ROW 1: MACRO HEALTH ---
st.divider()
alt_metrics = engine.alt_data.fetch_all_alt_data()
col1, col2, col3, col4, col5 = st.columns(5)
col1.metric("Total Net Worth", f"₹{total_val:,.2f}", f"${(total_val / fx):,.2f} USD" if fx else "")
col2.metric("Nifty 50 Beta", health.get('beta', 1.0))
col3.metric("AI Confidence", f"{briefing.get('confidence_score', 0) * 100}%" if briefing else "N/A")
col4.metric("Fear & Greed", f"{alt_metrics['fear_and_greed']['value']}/100",
            alt_metrics['fear_and_greed']['classification'])
col5.metric("DXY (FII Proxy)", f"{alt_metrics['fii_proxy']['dxy_value']}",
            alt_metrics['fii_proxy']['fii_trend'].split(' ')[0])

# --- TABS ---
tab1, tab2, tab3, tab4 = st.tabs(
    ["🔍 Asset Deep Dive", "🎯 Global AI Directives", "📈 Professional Analytics", "💼 Live Ledger"])

# ==========================================
# TAB 1: ASSET DEEP DIVE & CHARTS
# ==========================================
with tab1:
    analyzed_symbols = [a['symbol'] for a in assets]
    selected_sym = st.selectbox("Target Asset:", analyzed_symbols)

    if selected_sym:
        asset_data = next((a for a in assets if a['symbol'] == selected_sym), {})
        news_feed = engine.latest_news_cache.get(selected_sym, "")

        # Safe extraction of directives
        asset_directive = {}
        if briefing and briefing.get('directives'):
            asset_directive = next((d for d in briefing['directives'] if d.get('symbol') == selected_sym), {})

        c1, c2 = st.columns([2, 1.2])
        with c1:
            st.subheader(f"{selected_sym} - Institutional Chart (50/200 DMA)")
            hist_df = fetch_historical_data(selected_sym)
            if not hist_df.empty:
                # Limit view to last 3 months for Candlesticks, but we used 1y data to calculate the 200 DMA accurately
                view_df = hist_df.tail(90)
                fig = go.Figure()
                fig.add_trace(
                    go.Candlestick(x=view_df.index, open=view_df['Open'], high=view_df['High'], low=view_df['Low'],
                                   close=view_df['Close'], name="Price"))
                fig.add_trace(
                    go.Scatter(x=view_df.index, y=view_df['SMA50'], mode='lines', name='50 DMA (Medium Trend)',
                               line=dict(color='orange', width=1.5)))
                fig.add_trace(
                    go.Scatter(x=view_df.index, y=view_df['SMA200'], mode='lines', name='200 DMA (Macro Trend)',
                               line=dict(color='cyan', width=1.5)))

                if asset_data.get('tsl'):
                    fig.add_trace(
                        go.Scatter(x=[view_df.index[0], view_df.index[-1]], y=[asset_data['tsl'], asset_data['tsl']],
                                   mode="lines", line=dict(color="red", width=2, dash="dash"),
                                   name="Trailing Stop Loss"))
                fig.update_layout(height=500, margin=dict(l=0, r=0, t=30, b=0), template="plotly_dark",
                                  legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1))
                st.plotly_chart(fig, width='stretch')

            # BEAUTIFIED NEWS VIEWER
            st.subheader("📰 Market Catalysts (Scraped News)")
            if news_feed:
                for block in news_feed.split("\n\n"):
                    if "Title:" in block:
                        lines = block.split("\n")
                        title = lines[0].replace("Title: ", "") if len(lines) > 0 else "News Article"
                        snippet = lines[1].replace("Snippet: ", "") if len(lines) > 1 else ""
                        link = lines[2].replace("Link: ", "") if len(lines) > 2 else "#"
                        with st.container(border=True):
                            st.markdown(f"**[{title}]({link})**")
                            st.caption(snippet)
            else:
                st.info("No major news scraped for this asset today.")

        with c2:
            st.subheader("🧠 Intelligence Profile")
            if asset_directive:
                st.markdown(f"### 🚨 {asset_directive.get('action', 'HOLD')}")

                # Professional Scale Display
                m1, m2, m3 = st.columns(3)
                m1.metric("Conviction", f"{asset_directive.get('conviction_level', 'N/A')}/5")
                m2.metric("Risk/Reward", asset_directive.get('risk_reward_ratio', 'N/A'))
                m3.metric("Horizon", asset_directive.get('time_horizon', 'N/A'))

                st.info(f"**⚖️ Position Sizing:** {asset_directive.get('position_sizing', 'Hold allocation.')}")

                sent = asset_directive.get('news_sentiment', {})
                st.success(
                    f"**🗞️ NLP Sentiment:** {sent.get('bias', 'Neutral')} ({sent.get('confidence', 0)}% Conf)\n\n*Impact:* {sent.get('impact_summary', 'N/A')}")

                st.markdown(f"**📈 Technicals:** {asset_directive.get('technical_analysis', 'N/A')}")
                st.markdown(f"**🏢 Fundamentals:** {asset_directive.get('fundamental_analysis', 'N/A')}")
                st.markdown(f"**🧠 The Why:** {asset_directive.get('the_why', 'N/A')}")
            else:
                st.info("Awaiting Global Intelligence Cycle or skipped due to low priority.")

# ==========================================
# TAB 2: GLOBAL DIRECTIVES
# ==========================================
with tab2:
    if briefing:
        st.subheader("🔮 30-Day Projections")
        proj = briefing.get('future_projections', {})
        p1, p2, p3 = st.columns(3)
        p1.info(f"**Trend:** {proj.get('estimated_30d_trend', 'N/A')}")
        p2.warning(f"**Risk Level:** {proj.get('portfolio_risk_level', 'N/A')}")
        p3.error(f"**Catalyst:** {proj.get('catalyst_watch', 'N/A')}")

        st.divider()
        st.subheader("🎯 Executive Summary")
        dir_list = []
        for d in briefing.get('directives', []):
            dir_list.append({
                "Asset": d.get('symbol'), "Action": d.get('action'),
                "Conviction": f"{d.get('conviction_level', 'N/A')}/5",
                "Horizon": d.get('time_horizon', 'N/A'),
                "Sizing": d.get('position_sizing')
            })
        if dir_list: st.dataframe(pd.DataFrame(dir_list), width='stretch')

        st.divider()
        st.subheader("⏭️ Monitored Assets")
        st.info(briefing.get('skipped_assets_summary', 'None'))

# ==========================================
# TAB 3: PROFESSIONAL ANALYTICS (SPLIT BY TYPE)
# ==========================================
with tab3:
    st.subheader("📊 Cross-Asset Advanced Analytics")
    df = pd.DataFrame(assets)

    if not df.empty and 'rsi' in df.columns:
        scatter_df = df[df['rsi'].apply(lambda x: isinstance(x, (int, float)))].copy()

        # Segregate Stocks and Crypto for clean analysis
        st_df = scatter_df[scatter_df['type'] == 'stock']
        cr_df = scatter_df[scatter_df['type'] == 'crypto']

        ca, cb = st.columns(2)
        with ca:
            st.markdown("### 📈 Equities (Stocks) Risk vs Reward")
            if not st_df.empty:
                fig_s = px.scatter(st_df, x="rsi", y="value_inr", color="math_signal", hover_name="symbol", size="qty")
                fig_s.add_vline(x=30, line_dash="dash", line_color="green", annotation_text="Oversold")
                fig_s.add_vline(x=70, line_dash="dash", line_color="red", annotation_text="Overbought")
                fig_s.update_layout(height=400)
                st.plotly_chart(fig_s, width='stretch')

        with cb:
            st.markdown("### 🪙 Crypto Risk vs Reward")
            if not cr_df.empty:
                fig_c = px.scatter(cr_df, x="rsi", y="value_inr", color="math_signal", hover_name="symbol", size="qty")
                fig_c.add_vline(x=30, line_dash="dash", line_color="green", annotation_text="Oversold")
                fig_c.add_vline(x=70, line_dash="dash", line_color="red", annotation_text="Overbought")
                fig_c.update_layout(height=400)
                st.plotly_chart(fig_c, width='stretch')

    st.divider()
    st.subheader("📉 Correlation Heatmap (Contagion Risk)")
    corr_data = health.get('correlation_matrix', {})
    if corr_data:
        fig_heat = px.imshow(pd.DataFrame(corr_data), text_auto=".2f", aspect="auto", color_continuous_scale="RdBu_r",
                             origin='lower')
        st.plotly_chart(fig_heat, width='stretch')

# ==========================================
# TAB 4: LIVE LEDGER (SEGREGATED)
# ==========================================
with tab4:
    st.subheader("💼 Full Portfolio Ledger")
    df = pd.DataFrame(assets)
    if not df.empty:
        df['% of PF'] = (df['value_inr'] / total_val) * 100
        df['Value (INR)'] = df['value_inr'].apply(lambda x: f"₹{x:,.2f}")
        df['Price'] = df.apply(
            lambda row: f"₹{row['live_price']:,.2f}" if row['type'] == 'stock' else f"${row['live_price']:,.2f}",
            axis=1)

        clean_df = df[['symbol', 'qty', 'Price', 'Value (INR)', '% of PF', 'math_signal', 'type']]

        # Tabs inside a Tab to split Asset Classes!
        l_tab1, l_tab2, l_tab3 = st.tabs(["📈 Equities (Stocks)", "🪙 Cryptocurrencies", "🏦 Commodities / Fixed Income"])

        with l_tab1:
            st_data = clean_df[clean_df['type'] == 'stock'].drop(columns=['type'])
            st.dataframe(
                st_data.style.format({'% of PF': '{:.2f}%'}).background_gradient(subset=['% of PF'], cmap='Blues'),
                width='stretch')
        with l_tab2:
            cr_data = clean_df[clean_df['type'] == 'crypto'].drop(columns=['type'])
            st.dataframe(
                cr_data.style.format({'% of PF': '{:.2f}%'}).background_gradient(subset=['% of PF'], cmap='Purples'),
                width='stretch')
        with l_tab3:
            ot_data = clean_df[~clean_df['type'].isin(['stock', 'crypto'])].drop(columns=['type'])
            st.dataframe(
                ot_data.style.format({'% of PF': '{:.2f}%'}).background_gradient(subset=['% of PF'], cmap='Greens'),
                width='stretch')

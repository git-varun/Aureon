"""Regression tests for /api/state news grouping via news_assets junction."""

from unittest.mock import MagicMock, patch

# PortfolioService is imported inside build_state_payload, so patch the source module.
_PS_PATH = "app.modules.portfolio.services.PortfolioService"


def _empty_session():
    session = MagicMock()

    def _q(*args):
        q = MagicMock()
        q.join.return_value = q
        q.filter.return_value = q
        q.order_by.return_value = q
        q.limit.return_value = q
        q.all.return_value = []
        q.first.return_value = None
        q.notin_.return_value = q
        q.isnot.return_value = q
        q.in_.return_value = q
        return q

    session.query.side_effect = _q
    return session


def _empty_cache():
    c = MagicMock()
    c.get.return_value = None
    return c


def _mock_position(symbol="RELIANCE", asset_type="equity"):
    """Minimal mock position that passes state_builder's iteration."""
    asset = MagicMock()
    asset.symbol = symbol
    asset.name = f"{symbol} Ltd"
    asset.asset_type = asset_type
    asset.sub_type = None
    asset.exchange = "NSE"
    asset.current_price = 100.0
    asset.id = 1

    pos = MagicMock()
    pos.asset = asset
    pos.asset_id = 1
    pos.current_value = 10000.0
    pos.quantity = 100.0
    pos.avg_buy_price = 90.0
    pos.pnl = 1000.0
    pos.pnl_percent = 11.1
    return pos


class TestStateBuilderNewsGrouping:

    def test_empty_portfolio_returns_empty_news(self):
        from app.modules.portfolio.state_builder import build_state_payload

        with patch(_PS_PATH) as MockPS:
            MockPS.return_value.list_positions.return_value = []
            result = build_state_payload(_empty_session(), _empty_cache(), lambda *a: "-".join(a))

        assert result["status"] == "empty"
        assert result["news"] == {}

    def test_news_key_always_present_in_response(self):
        from app.modules.portfolio.state_builder import build_state_payload

        with patch(_PS_PATH) as MockPS:
            MockPS.return_value.list_positions.return_value = []
            result = build_state_payload(_empty_session(), _empty_cache(), lambda *a: "-".join(a))

        assert "news" in result

    def test_junction_query_issued_when_positions_exist(self):
        """state_builder must issue a News query when positions are present."""
        from app.modules.portfolio.state_builder import build_state_payload
        from app.modules.news.models import News

        captured = []

        def _q(*args):
            captured.append(args)
            q = MagicMock()
            q.join.return_value = q
            q.filter.return_value = q
            q.order_by.return_value = q
            q.limit.return_value = q
            q.all.return_value = []
            q.first.return_value = None
            q.notin_.return_value = q
            q.isnot.return_value = q
            q.in_.return_value = q
            return q

        session = MagicMock()
        session.query.side_effect = _q

        with patch(_PS_PATH) as MockPS:
            MockPS.return_value.list_positions.return_value = [_mock_position()]
            build_state_payload(session, _empty_cache(), lambda *a: "-".join(a))

        news_queries = [args for args in captured if News in args]
        assert len(news_queries) >= 1, "state_builder issued no News query"

    def test_article_with_junction_row_but_empty_symbols_attributed(self):
        """Regression: article with symbols='' but a news_assets junction row appears under
        the linked asset symbol — not under 'GENERAL'."""
        from app.modules.portfolio.state_builder import build_state_payload
        from app.modules.news.models import News

        fake_news = MagicMock(spec=News)
        fake_news.id = 999
        fake_news.title = "Junction-only article"
        fake_news.summary = "No symbols field"
        fake_news.url = "http://example.com/junction-only"
        fake_news.source = "test"
        fake_news.sentiment_score = None
        fake_news.symbols = ""  # deliberately empty

        junction_result = [(fake_news, "RELIANCE")]

        news_call = {"n": 0}

        def _q(*args):
            q = MagicMock()
            q.join.return_value = q
            q.filter.return_value = q
            q.order_by.return_value = q
            q.first.return_value = None
            q.notin_.return_value = q
            q.isnot.return_value = q
            q.in_.return_value = q
            q.all.return_value = []

            if News in args:
                news_call["n"] += 1
                if news_call["n"] == 1:
                    # First News query = junction JOIN path
                    q.limit.return_value.all.return_value = junction_result
                else:
                    # Fallback query returns nothing
                    q.limit.return_value.all.return_value = []
            else:
                q.limit.return_value.all.return_value = []

            return q

        session = MagicMock()
        session.query.side_effect = _q

        with patch(_PS_PATH) as MockPS:
            MockPS.return_value.list_positions.return_value = [_mock_position()]
            result = build_state_payload(session, _empty_cache(), lambda *a: "-".join(a))

        assert "RELIANCE" in result["news"], (
            f"Expected 'RELIANCE' in news keys, got: {list(result['news'].keys())}"
        )
        assert result["news"]["RELIANCE"][0]["title"] == "Junction-only article"
        assert "GENERAL" not in result["news"]

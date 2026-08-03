import uuid

from app.modules.market.entities.market import Asset
from app.modules.market.repositories.market import MarketRepository

# Regression test: search_assets had no exact-match ordering, so when more than
# `limit` assets share a substring with the query, an exact symbol match could
# be pushed out of the results entirely. The frontend (useAureonData.js) does
# an exact `.find()` on the search response and falls back to class 'stocks'
# when no exact match is returned, which silently broke the Holdings class
# filter (Crypto/Funds/Bonds/Retirement) for any such symbol.


def _make_asset(symbol, name, asset_class="equity"):
    return Asset(id=uuid.uuid4(), symbol=symbol, name=name, asset_class=asset_class)


def test_search_assets_returns_exact_symbol_match_even_when_outnumbered(db_session):
    repo = MarketRepository(db_session)

    # 11 assets contain "ZZTEST" as a substring (e.g. "ZZTEST0") and are
    # inserted before the exact "ZZTEST" match, so without exact-match
    # ordering a naive limit(10) drops the exact match entirely.
    for i in range(11):
        db_session.add(_make_asset(f"ZZTEST{i}", f"Regression Coin {i}", asset_class="crypto"))
    db_session.add(_make_asset("ZZTEST", "Regression Coin", asset_class="crypto"))
    db_session.flush()

    results = repo.search_assets("ZZTEST", "ZZTEST", limit=10)

    assert any(a.symbol == "ZZTEST" for a in results)

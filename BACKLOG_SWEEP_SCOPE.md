# Backlog — deferred from the Allocation-section audit sweep

Items identified during the Portfolio Allocation audit/fix pass that are
real features, not bugs, and were explicitly deferred rather than built
as part of that pass.

## Real cash-balance tracking

`PortfolioSnapshot.cash_balance` is `None` today (see
`generate_portfolio_snapshot`, `backend/app/modules/portfolio/services/portfolio.py`) —
there is no mechanism anywhere in Aureon that tracks uninvested cash. The
interim fix (this sweep) made that honest: `cash_balance` is `null`
("not tracked") rather than a hardcoded `0.0` that was indistinguishable
from a real, computed zero balance. The Allocation UI excludes cash from
the net-worth denominator when untracked and labels the allocation as
"based on holdings only" instead of silently treating unknown cash as
zero.

Building real tracking is a distinct feature with real design questions:
- Manual entry (user types a cash figure) vs. transaction-derived
  (infer from buy/sell/deposit/withdrawal history) vs. broker-reported
  balance (where a provider exposes one, e.g. Zerodha/Groww margin
  APIs) — these have different accuracy/effort tradeoffs and may need
  to coexist per-broker.
- How it interacts with the existing `CashDeploymentCard` /
  `get_cash_deployment_opportunities` (`backend/app/modules/ai/services/intelligence.py`),
  which already computes a `cash_ratio` off `cash_balance` today — that
  feature would become materially more useful once real values exist.

Not scoped here. Track as a future feature.

# Canonicalization Sprint — Baseline Metrics

Captured 2026-07-02, before any Phase 1+ changes. Re-run the same commands after Phase 11 for "after" numbers.

| Metric | Value | Command |
|---|---|---|
| Python LOC (backend/) | 21,917 | `git ls-files backend \| grep '\.py$' \| xargs wc -l \| tail -1` |
| React/JS LOC (frontend/src) | 22,437 | `git ls-files frontend/src \| grep -E '\.(jsx\|js)$' \| xargs wc -l \| tail -1` |
| Canonical `/api/v1/*` endpoints | 92 | `grep -rE '@router\.(get\|post\|put\|patch\|delete)' backend/app/api/v1 \| wc -l` |
| `compatibility.py` endpoints | 88 | `grep -E '@router\.(get\|post\|put\|patch\|delete)' backend/app/api/compatibility.py \| wc -l` |
| Domain services (files) | 14 | `find backend/app/domain/services -name '*.py' ! -name '__init__.py' \| wc -l` |
| Infrastructure repositories (files) | 21 | `find backend/app/infrastructure/repositories -name '*.py' ! -name '__init__.py' \| wc -l` |
| Frontend components (.jsx files) | 102 | `find frontend/src/components -name '*.jsx' \| wc -l` |
| Backend tests collected | 88 | `uv run pytest --collect-only -q` (from `backend/`) |
| Docker startup time | not measured | stack was not running at capture time; measure on next full `docker compose up -d` |

## Notes

- The 92 canonical + 88 compatibility endpoint counts overlap significantly: most compatibility.py routes are cloned into a `v1_compat_router` at startup (`backend/app/api/main.py:288-318`), so the *effective* served endpoint count is higher than either number alone until Phase 1 consolidates them into one canonical set.
- Test count (88) is a `--collect-only` count, not a pass/fail count — re-check pass rate separately in Phase 11.

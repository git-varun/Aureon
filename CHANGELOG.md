# Changelog

All notable changes to the Aureon project will be documented in this file.

## [7.0.0] - 2026-06-18
### Added
- Created Github Actions workflow (`.github/workflows/backend.yml`) for automated CI testing and static analysis.
- Added project development `Makefile` with canonical support targets (`make dev`, `make test`, `make lint`, `make typecheck`).
- Restructured `docs/` folder layout into standardized sections (`architecture/`, `operations/`, `development/`, `decisions/`, `archive/`).

### Changed
- Relocated and consolidated multi-format design specifications, handoff logs (`Aureon Soul.txt`, `Untitled Document 1`), and old sprint reports into `docs/archive/`.
- Optimized import graphs across the monolith, executing automatic import sorting and inline-import pruning (`app/api/main.py`, `app/api/v1/auth.py`, `app/workers/celery_app.py`).

### Removed
- Completely deleted legacy residue directory `backend_old` from workspace.
- Completely deleted legacy prototype JSX/HTML template folder `Aureon`.
- Deleted duplicate root database file `test.db` and development caches (`.pytest_cache`, `.mypy_cache`, `.ruff_cache`).

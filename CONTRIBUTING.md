# Contributing to Aureon

We welcome contributions to the Aureon Portfolio Management System! To maintain code quality and ensure a smooth review process, please follow these guidelines:

## Development Environment Setup

1. Setup the backend virtualenv:
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -e .[dev]
   ```
2. Setup the frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```
3. Run the development servers using the provided `Makefile` in the root:
   ```bash
   make dev
   ```

## Development Guidelines

- **Code Quality**: Ensure all code changes pass linting (`ruff check .`) and static type checking (`mypy .`) in the backend.
- **Tests**: Write unit and integration tests under `backend/tests/` for any new logic or API endpoints. All tests must pass before submitting contributions.
- **Migrations**: If database schemas are changed, generate clean, descriptive database migrations using Alembic:
  ```bash
  alembic revision --autogenerate -m "description_of_changes"
  ```
- **Documentation**: Update the relevant markdown files under `docs/` if modifying features or deployment guidelines. Reorganize historical sprint reports under `docs/archive/` instead of deleting them.

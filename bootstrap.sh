#!/bin/bash
# Aureon single bootstrap entrypoint.
# Idempotent — safe to re-run against an already-bootstrapped database.
#
# Usage:
#   ./bootstrap.sh
#
# To also create the first administrator (only runs if no users exist yet):
#   BOOTSTRAP_EMAIL=admin@example.com BOOTSTRAP_PASSWORD='SecurePass123!' ./bootstrap.sh
set -e

cd "$(dirname "$0")/backend"
uv run python scripts/bootstrap.py

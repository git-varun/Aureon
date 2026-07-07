#!/usr/bin/env python
"""Re-encrypts every stored provider credential from an old SECRET_KEY to a new one.

Run this BEFORE deploying a new SECRET_KEY, using the currently-deployed key as
--old-secret and the key you're about to deploy as --new-secret. Only deploy the
new SECRET_KEY once this reports zero failures — otherwise every stored provider
credential decrypts to nothing the next time it's read.

Usage (run from backend/, with PYTHONPATH set so `app` is importable):
    PYTHONPATH=. python scripts/rotate_provider_keys.py --old-secret "$OLD" --new-secret "$NEW"
"""
import argparse
import sys

from app.core.database import SessionLocal
from app.core.services.config import ConfigService
from app.core.repositories.config import ConfigRepository


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--old-secret", required=True, help="The currently-deployed SECRET_KEY")
    parser.add_argument("--new-secret", required=True, help="The SECRET_KEY you're about to deploy")
    args = parser.parse_args()

    with SessionLocal() as db:
        result = ConfigService(ConfigRepository(db)).rotate_encryption_key(args.old_secret, args.new_secret)

    print(f"Rotated: {result['rotated_count']}")
    print(f"Skipped (already empty): {result['skipped_empty']}")
    if result["failures"]:
        print(f"FAILURES: {len(result['failures'])} — do NOT deploy the new SECRET_KEY yet")
        for f in result["failures"]:
            print(f"  {f['provider_name']}.{f['key_name']}: {f['error']}")
        return 1

    print("All credentials rotated successfully. Safe to deploy the new SECRET_KEY.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

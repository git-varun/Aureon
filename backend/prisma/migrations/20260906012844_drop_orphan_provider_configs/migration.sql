-- Remove orphan provider_configs rows left by an earlier camelCase-keyed bug.
-- These names are not in DEFAULT_PROVIDERS, nothing in the codebase references
-- them, and seedDefaultProviders can never recreate them. The encrypted_keys
-- = '{}' guard ensures we never delete a row that somehow holds real
-- credential material.
DELETE FROM "config"."provider_configs"
WHERE "provider_name" IN ('finnHub', 'alphaVantage', 'twelveData', 'twelve_data')
  AND "encrypted_keys" = '{}';

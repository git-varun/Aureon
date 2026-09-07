-- Remove the orphan config.job_configs row for `sync_portfolio`.
-- It never had a Node runner, job file, or beat_schedule entry — a pure
-- _DEFAULT_JOBS roadmap leftover from the Python port that only surfaced in
-- GET /jobs as a job which always 400s on dispatch. The DEFAULT_JOBS seed
-- entry was removed in the same change, so seedDefaultJobs can never
-- recreate it. See docs/audits/job-inventory-review-2026-09-07.md.
DELETE FROM "config"."job_configs" WHERE "job_name" = 'sync_portfolio';

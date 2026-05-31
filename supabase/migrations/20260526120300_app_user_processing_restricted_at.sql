-- T-09: GDPR Art. 18 right to restriction of processing.
--
-- Distinct from Art. 17 (right to erasure / DSAR delete). Restriction lets a
-- user freeze their data: it stays in the DB, queryable as a record, but
-- nurture cron + scoring re-runs + analytics digests SKIP it. Use cases:
--   - User disputes the accuracy of their data and wants no further
--     processing while we investigate.
--   - User objects to processing under Art. 21 and we have a legal duty to
--     preserve the data (e.g., accounting retention on a paid order) but
--     can't legitimately keep processing it.
--
-- Storage on app_user (not survey_submission) because restriction follows the
-- person, not the submission. A user with multiple submissions has them all
-- frozen at once.
--
-- Setting + clearing is admin-only (a new admin action will land in a
-- follow-up; this migration just lays the column).

-- migration-lint: ignore
-- (Reason: pure ADD COLUMN with NULL default. Safe online operation.)

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS processing_restricted_at TIMESTAMPTZ;

-- Partial index — only restricted rows are queried "show me everyone
-- frozen", so a partial index is much smaller than full.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_user_processing_restricted_at
  ON public.app_user (processing_restricted_at)
  WHERE processing_restricted_at IS NOT NULL;

-- F-17: optional report_access_token expiry.
--
-- The prior migration (20260501130000_report_access_token_revoked_at.sql)
-- documented "tokens stay permanent by product design (don't auto-expire
-- bookmarked URLs)." That decision stands — we don't auto-expire here.
--
-- This migration adds the *infrastructure* for per-token expiry so ops can
-- mint a time-bounded token in narrow cases (one-time previews, shared links
-- with a deadline) without a future schema change. Existing tokens have
-- expires_at = NULL and remain permanent. The reader is updated in the
-- same PR to honor `expires_at > now()` when present.

-- migration-lint: ignore
-- (Reason: pure ADD COLUMN with NULL default; safe online operation on
--  Postgres 12+. No index added because the existing
--  idx_report_access_token_active_token (WHERE revoked_at IS NULL) already
--  filters the common case down to a small set; adding expires_at to the
--  predicate would require an IMMUTABLE expression, and Postgres rejects
--  now() there. Query-time filter on expires_at is fast enough on the
--  pre-filtered, indexed result set.)

BEGIN;

ALTER TABLE public.report_access_token
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMIT;

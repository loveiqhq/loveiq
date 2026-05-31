-- P-05: pg_trgm GIN index on app_user.email for admin substring search
--
-- Admin submission browser uses PostgREST `email.ilike.*${pattern}*` which
-- translates to `ILIKE '%query%'`. Without a trigram index the planner does
-- a sequential scan — fine at ~10K rows, noticeably slow at >100K. The
-- pg_trgm extension's gin_trgm_ops operator class lets ILIKE leverage a
-- GIN index for arbitrary substring matches. PostgREST query stays
-- unchanged; the planner uses the index automatically once available.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

COMMIT;

-- Index built CONCURRENTLY (outside the transaction) so the build doesn't
-- hold an AccessExclusiveLock on app_user. Pattern mirrors the other
-- post-COMMIT CONCURRENTLY blocks in this codebase (e.g.
-- 20260525120000_data_subject_request_log.sql).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_user_email_trgm
  ON app_user
  USING gin (email gin_trgm_ops);

-- DOWN migration for 20260525120200_scoring_result_config_sha.sql.
--
-- Drops scoring_result.config_sha and its index. The index is dropped
-- CONCURRENTLY first (cannot run inside a transaction); the column drop is a
-- metadata-only operation in Postgres (no table rewrite) so it is fast even on
-- a multi-million-row table.
--
-- WARNING — DATA LOSS: the per-row config SHA (audit/replay identifier) is
-- discarded. engine_version is unaffected. Only run when reverting F-03, and
-- redeploy the app so storeScoringResult() stops writing the column.
--
-- NOTE: no BEGIN/COMMIT — DROP INDEX CONCURRENTLY is not allowed in a txn.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260525120200_scoring_result_config_sha_down.sql

DROP INDEX CONCURRENTLY IF EXISTS idx_scoring_result_config_sha;

ALTER TABLE scoring_result
  DROP COLUMN IF EXISTS config_sha;

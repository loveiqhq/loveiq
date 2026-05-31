-- DOWN migration for 20260527120100_pg_trgm_admin_search.sql.
--
-- Drops the trigram GIN index on app_user.email. Dropped CONCURRENTLY (no
-- transaction) so the admin-search ILIKE simply falls back to a sequential
-- scan (fine at current scale).
--
-- The pg_trgm EXTENSION is intentionally LEFT in place: it is harmless and may
-- back other indexes/queries. Dropping a shared extension is riskier than
-- leaving it, so this rollback does not `DROP EXTENSION`.
--
-- NOTE: no BEGIN/COMMIT — DROP INDEX CONCURRENTLY is not allowed in a txn.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260527120100_pg_trgm_admin_search_down.sql

DROP INDEX CONCURRENTLY IF EXISTS idx_app_user_email_trgm;

-- Rollback of 20261120010000_mira_indexes.sql. Nothing reads the indexes by name, so the code
-- needs no change: the queries they serve only get slower. CONCURRENTLY, so outside a
-- transaction, as the migration was.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261120010000_mira_indexes_down.sql

DROP INDEX CONCURRENTLY IF EXISTS public.mira_event_user_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.mira_nudge_chat_idx;

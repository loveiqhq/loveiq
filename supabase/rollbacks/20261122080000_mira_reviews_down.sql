-- Rollback of 20261122080000_mira_reviews.sql: the ratings table goes. Roll the code back first:
-- it reads and writes mira_review. Dropping the table deletes every rating and quote.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261122080000_mira_reviews_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS public.mira_review;

COMMIT;

-- Rollback of 20261122110000_mira_reviews_reasons.sql: mira_review.reject_reason and via go.
-- Roll the code back first: the rating routes, Settings and AP › Mira read and write them. The
-- reasons kept for writers, and where each rating was given, are lost.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261122110000_mira_reviews_reasons_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_review
  DROP CONSTRAINT IF EXISTS mira_review_reason_with_rejection,
  DROP COLUMN IF EXISTS reject_reason,
  DROP COLUMN IF EXISTS via;

COMMIT;

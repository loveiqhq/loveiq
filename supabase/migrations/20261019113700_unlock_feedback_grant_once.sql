-- Unlock feedback: one free unlock per reader, held by the database.
--
-- An answer on /why unlocks the full report with a 0 payment whose metadata.source is
-- 'unlock_feedback' (features/unlock-feedback/server/grant.ts). A double tap, or two tabs, can
-- post the answer at the same instant, and both requests can find no grant before either
-- writes one. This index refuses the second insert (PostgREST answers 409), and that request
-- then uses the first one's payment. Partial: no other payment carries this source, so no
-- existing row is indexed and no other insert is affected.
--
-- CONCURRENTLY, like every index on payment (20260531131925): a live table. It cannot run
-- inside a transaction block. Rollback:
-- supabase/rollbacks/20261019113700_unlock_feedback_grant_once_down.sql.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS payment_unlock_feedback_once
  ON public.payment (personal_report_id)
  WHERE metadata->>'source' = 'unlock_feedback';

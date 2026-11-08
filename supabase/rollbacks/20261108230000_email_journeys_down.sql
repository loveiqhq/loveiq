-- Rollback of 20261108230000_email_journeys: the send log, the buyer's draft link and the
-- email switches go. Deploy code that no longer reads them FIRST (the journey job, the
-- survey-start stamp and every sender that asks a switch). Idempotent. Then delete the
-- migration's ledger row.
--   psql "$DATABASE_URL" -f supabase/rollbacks/20261108230000_email_journeys_down.sql

BEGIN;

DELETE FROM system_flags WHERE key IN (
  'email_i1_v2', 'email_r1_v2', 'email_u1_v2', 'email_c1_v2', 'email_s2_v2', 'email_i3_v2',
  'email_c3_c4_v2', 'email_i2', 'email_i4', 'email_r2', 'email_c2', 'email_s3_s5',
  'email_pts_reminders'
);

ALTER TABLE public.prepaid_report_access DROP COLUMN IF EXISTS survey_session_id;

DROP TABLE IF EXISTS public.email_journey_send;

COMMIT;

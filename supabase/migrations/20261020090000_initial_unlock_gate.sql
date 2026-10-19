-- Pre-unlock: the forced EUR 1.99 gate after the survey (Notion "RFD > Pre-Unlock", Figma
-- Report-3.0 1604:2328). A reader whose survey was submitted while the gate is on opens on a
-- EUR 1.99 page instead of their report; paying (plan 'initial') opens the Core Archetype.
--
-- Additive only: four nullable columns on personal_report, one partial index, and the two
-- kill switches, both seeded OFF. isFeatureEnabled() reads them with a default of off too,
-- so a missing row or a Supabase outage never gates anyone.
--
--   initial_gate_cohort_at  the survey was submitted while report_initial_unlock_gate was on.
--                           Only these reports are ever gated: a report read for free before
--                           the launch stays as it was
--   initial_gate_seen_at    the first time the gate was shown. It is the gate's "paywall
--                           reached" (no price quote exists before the report) and the day
--                           E07 counts its four days from
--   initial_gift_arm        E07's 80/20 assignment, written once by its cron: 'gift' (the Core
--                           Archetype is gifted, with the email) or 'holdout' (nothing)
--   initial_gift_sent_at    when E07 went out, so a re-run never sends it twice
--
-- Read only through features/report/server/initialGateState.ts, each in its own query that
-- fails soft; none is in the report lookup's select. Deploying before this is applied is
-- therefore safe (nothing is gated, the stamps log a warning), but apply it first.
-- Rollback: supabase/rollbacks/20261020090000_initial_unlock_gate_down.sql

BEGIN;

ALTER TABLE public.personal_report
  ADD COLUMN IF NOT EXISTS initial_gate_cohort_at timestamptz,
  ADD COLUMN IF NOT EXISTS initial_gate_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS initial_gift_arm text,
  ADD COLUMN IF NOT EXISTS initial_gift_sent_at timestamptz;

DO $migration$
BEGIN
  -- initial_gift_arm: only the two arms the cron writes. Idempotent.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'personal_report'
       AND con.conname = 'personal_report_initial_gift_arm_check'
  ) THEN
    ALTER TABLE public.personal_report
      ADD CONSTRAINT personal_report_initial_gift_arm_check
      CHECK (initial_gift_arm IS NULL OR initial_gift_arm IN ('gift', 'holdout'));
  END IF;
END
$migration$;

-- The kill switches. Both start OFF: the gate ships dark and is switched on at launch, and
-- switching it off again opens every report as before, stamped ones included.
INSERT INTO system_flags (key, enabled, description) VALUES
  ('report_initial_unlock_gate', false,
    'The EUR 1.99 pre-unlock gate (RFD > Pre-Unlock). On: surveys submitted from then on open on a EUR 1.99 page before their report; paying opens the Core Archetype and the Summary. Off: nobody meets the gate, including readers stamped while it was on.'),
  ('initial_unlock_gift_email', false,
    'E07, the day-4 Core Archetype gift (RFD > Pre-Unlock). On: four days after a reader first saw the gate without paying, 80% get the Core Archetype gifted and the email, 20% are a holdout that gets nothing. Off: nothing is gifted or sent.')
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- Index CONCURRENTLY, outside the transaction (Postgres requirement and the migration lint).
-- E07's hourly pick: reports that met the gate and have no gift arm yet.
CREATE INDEX CONCURRENTLY IF NOT EXISTS personal_report_initial_gate_seen_idx
  ON public.personal_report (initial_gate_seen_at)
  WHERE initial_gate_seen_at IS NOT NULL AND initial_gift_arm IS NULL;

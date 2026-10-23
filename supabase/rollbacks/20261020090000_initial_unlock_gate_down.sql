-- Rollback for 20261020090000_initial_unlock_gate. The gate's own reads of these columns fail
-- soft, so without them nobody is gated and no E07 goes out; every gated read logs a warning
-- until code without the gate is deployed. Three readers fail closed instead, and need the
-- column while the code that reads it is live: the brain's A/B readouts (they error), and the
-- 72h and unlock-feedback emails when the gate's switch also can't be read (they wait). Roll
-- the code back first, or keep this window short. What goes: who joined the gate's
-- cohort, when each reader first saw it, and E07's arms and send times. The payment rows the
-- gate and E07 wrote stay, and keep their readers' Core Archetype open.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261020090000_initial_unlock_gate_down.sql

BEGIN;

DELETE FROM system_flags WHERE key IN ('report_initial_unlock_gate', 'initial_unlock_gift_email');

ALTER TABLE public.personal_report
  DROP CONSTRAINT IF EXISTS personal_report_initial_gift_arm_check;

ALTER TABLE public.personal_report
  DROP COLUMN IF EXISTS initial_gate_cohort_at,
  DROP COLUMN IF EXISTS initial_gate_seen_at,
  DROP COLUMN IF EXISTS initial_gift_arm,
  DROP COLUMN IF EXISTS initial_gift_sent_at;

COMMIT;

DROP INDEX CONCURRENTLY IF EXISTS public.personal_report_initial_gate_seen_idx;

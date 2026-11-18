-- Rollback of 20261118210000_mira_nudges_and_memory.sql. Roll the code back first: the nudge
-- cron, the settings and the preference pages read these columns.

DROP FUNCTION IF EXISTS public.mira_forget_old_memory(integer);
DROP TABLE IF EXISTS public.mira_nudge;
ALTER TABLE public.mira_user
  DROP COLUMN IF EXISTS nudge_stop_reason,
  DROP COLUMN IF EXISTS nudges_stopped_at,
  DROP COLUMN IF EXISTS nudges_paused_until,
  DROP COLUMN IF EXISTS nudge_types,
  DROP COLUMN IF EXISTS nudge_frequency,
  DROP COLUMN IF EXISTS time_zone,
  DROP COLUMN IF EXISTS nudge_time,
  DROP COLUMN IF EXISTS nudges_on;

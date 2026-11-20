-- Rollback of 20261120020000_mira_nudge_opens.sql: the two columns go, with what they held.

ALTER TABLE public.mira_nudge
  DROP COLUMN IF EXISTS delivered_at,
  DROP COLUMN IF EXISTS opened_at;

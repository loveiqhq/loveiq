-- When a Mira nudge email was delivered and first opened, for the "Nudge emails" numbers (Marcus's
-- MVP success board: open rate = opened / delivered). The send tags the email with the row id and
-- the Resend webhook (app/api/resend/webhook/route.ts) fills each column the first time only.
-- Follows 20261118220000. Rollback: supabase/rollbacks/20261120020000_mira_nudge_opens_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_nudge
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz;

COMMENT ON COLUMN public.mira_nudge.delivered_at IS
  'First email.delivered from Resend for this nudge (tag mira_nudge = id).';
COMMENT ON COLUMN public.mira_nudge.opened_at IS
  'First email.opened from Resend for this nudge; Apple Mail privacy opens are included.';

COMMIT;

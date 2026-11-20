-- Mira's sign-up consent, reworded on 20 Nov 2026 (version mira-2026-11-21): the LoveIQ test
-- result and the team reading rated replies are both optional, unticked boxes. Follows
-- 20261120050000. Rollback: supabase/rollbacks/20261121020000_mira_consent_choices_down.sql
--
-- mira_user.use_assessment: now off unless the person ticks "Use my LoveIQ test result to tailor
--   my coaching" (it was on by default). There are no real users yet, so every existing row is
--   set off too.
-- mira_user.share_rated_replies: "Mira's team may read replies I rate, to improve Mira", off
--   unless ticked. Set at every sign-in from the form, like the consent itself.
--
-- Apply before the code that writes share_rated_replies at sign-in is deployed.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_user ALTER COLUMN use_assessment SET DEFAULT false;

UPDATE public.mira_user SET use_assessment = false WHERE use_assessment;

ALTER TABLE public.mira_user
  ADD COLUMN IF NOT EXISTS share_rated_replies boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.mira_user.use_assessment IS
  'The person ticked "Use my LoveIQ test result to tailor my coaching" (sign-up, or Home and Settings); off by default.';
COMMENT ON COLUMN public.mira_user.share_rated_replies IS
  'The person ticked "Mira''s team may read replies I rate, to improve Mira" at their last sign-in; off by default. Without it, staff may not read the replies they rated.';

COMMIT;

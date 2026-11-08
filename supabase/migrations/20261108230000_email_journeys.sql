-- The reworked email journeys, phase 1 (Mark's "Email overview" canvas; the plan in
-- #all-loveiq on 6 Nov 2026). Additive only. Rollback:
-- supabase/rollbacks/20261108230000_email_journeys_down.sql
--
-- 1. email_journey_send: one row per email of a journey and the one thing it is about (the
--    target), claimed BEFORE the send, as E07 and the 72h email claim theirs: a lost send is
--    preferred to a double one. Unique (email_key, target), so a rerun or a second instance
--    never sends twice. A target is 'session:<survey draft uuid>', 'sub:<submission id>' or
--    'prepaid:<prepaid_report_access id>'. No address is kept: the submission and the purchase
--    cascade, so erasing either erases its rows. status: 'claimed' (the send is under way, or
--    timed out and may have gone), 'sent' (Resend took it, its id in resend_id), 'failed' (an
--    error after the claim; kept, so it is not tried again).
-- 2. prepaid_report_access.survey_session_id: the buyer's survey draft
--    (survey_partial_save.session_id), written by /api/survey-partial beside survey_started_at,
--    so a paused buyer's reminder can read how far they got and go to the address they paid
--    with, whether or not their survey already asked for one. Nothing personal: a random id.
-- 3. system_flags: one switch per new or redesigned email, all OFF. Off, every email stays as it
--    is today and no new one goes out; each is switched on after its trial send is approved.
--
-- APPLY BEFORE DEPLOYING the change that writes survey_session_id: PostgREST refuses a column it
-- does not know, so the buyer's survey-start stamp would fail (it is best-effort and never
-- blocks a draft, but the stamp would be lost).

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.email_journey_send (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_key            text NOT NULL CHECK (email_key ~ '^[a-z0-9_]{1,40}$'),
  target               text NOT NULL CHECK (target ~ '^(session|sub|prepaid):[A-Za-z0-9-]{1,64}$'),
  survey_submission_id bigint REFERENCES public.survey_submission (id) ON DELETE CASCADE,
  prepaid_access_id    bigint REFERENCES public.prepaid_report_access (id) ON DELETE CASCADE,
  status               text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'sent', 'failed')),
  resend_id            text,
  claimed_at           timestamptz NOT NULL DEFAULT now(),
  sent_at              timestamptz,
  CONSTRAINT email_journey_send_once UNIQUE (email_key, target)
);

CREATE INDEX IF NOT EXISTS email_journey_send_submission_idx
  ON public.email_journey_send (survey_submission_id)
  WHERE survey_submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_journey_send_prepaid_idx
  ON public.email_journey_send (prepaid_access_id)
  WHERE prepaid_access_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_journey_send_key_claimed_idx
  ON public.email_journey_send (email_key, claimed_at);

ALTER TABLE public.email_journey_send ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.email_journey_send;

CREATE POLICY "Service role only"
ON public.email_journey_send
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.email_journey_send IS
  'One row per journey email and target, claimed before the send (features/email-journeys). Unique (email_key, target).';

ALTER TABLE public.prepaid_report_access
  ADD COLUMN IF NOT EXISTS survey_session_id uuid;

COMMENT ON COLUMN public.prepaid_report_access.survey_session_id IS
  'The buyer''s survey draft (survey_partial_save.session_id), written by /api/survey-partial with survey_started_at; the latest draft wins. Read by the pay-to-start survey reminders.';

INSERT INTO system_flags (key, enabled, description) VALUES
  ('email_i1_v2', false,
    'I1, "Your report is ready", redesigned (Email overview canvas). On: a reader the EUR 1.99 gate will stop gets the new email at survey submit. Off: today''s email (and its A/B test).'),
  ('email_r1_v2', false,
    'R1, "Survey paused", redesigned: how far they got and the minutes left. On: the hourly survey-paused job sends the new email. Off: today''s email (and its A/B test).'),
  ('email_u1_v2', false,
    'U1, "Core Archetype unlocked" (EUR 1.99), redesigned. On: the new email after a EUR 1.99 purchase, or when a EUR 1.99 pay-to-start buyer finishes the survey. Off: today''s E06.'),
  ('email_c1_v2', false,
    'C1, "Full report unlocked", redesigned, with a share link. On: the new email after a full-report purchase, or when a EUR 29.99 pay-to-start buyer finishes the survey. Off: today''s email (and its A/B test).'),
  ('email_s2_v2', false,
    'S2, pay to start "Payment received", redesigned (EUR 1.99 and EUR 29.99 versions). On: the new email when a payment is confirmed before the survey. Off: today''s email.'),
  ('email_i3_v2', false,
    'I3, the day-1 gift email (E07), redesigned. Needs initial_unlock_gift_email on to send at all. On: the gift goes out with the new email. Off: today''s E07.'),
  ('email_c3_c4_v2', false,
    'C3 and C4, the invite reminders, redesigned and moved to days 3 and 5 after a full-report purchase. Off: today''s emails on days 3-7 and 7-21.'),
  ('email_i2', false,
    'I2, "What EUR 1.99 opens" (new): 3 h after the report, to a reader the gate stopped who has not paid. Off: not sent.'),
  ('email_i4', false,
    'I4, "Gift still unopened" (new): a day after the E07 gift, to a gifted reader who has not opened the report since. Off: not sent.'),
  ('email_r2', false,
    'R2, "Your answers are still saved" (new): 2 days after the last saved answer, once R1 went out. The last survey reminder. Off: not sent.'),
  ('email_c2', false,
    'C2, "Back into your report" (new): a day after a full-report purchase. Off: not sent.'),
  ('email_s3_s5', false,
    'S3, S4, S5 (new): pay-to-start buyers who have not started the survey, 1, 2 and 4 days after paying. Off: not sent.'),
  ('email_pts_reminders', false,
    'R1 and R2 for pay to start (new): a buyer who paused the survey, at the address they paid with, with their continue link. Off: not sent (today they get no survey reminder).')
ON CONFLICT (key) DO NOTHING;

COMMIT;

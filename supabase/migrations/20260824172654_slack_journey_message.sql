-- Where a posted journey notification lives, so later milestones can EDIT it
-- instead of posting a second message.
--
-- The per-user Slack notification fires at survey submit, when the only milestone
-- that can be true is "survey done" — report-open, paywall, checkout and paid all
-- read from rows that do not exist yet, and the pricing/paywall arms have no
-- quote to read from. The rail was therefore permanently 1-of-5 and two arm rows
-- permanently said "Not recorded". Incoming webhooks return no message id, so
-- there was nothing to come back to; chat.postMessage does, and that id lives
-- here.
--
-- One row per submission: a submission has exactly one notification.
--
-- `state` is the furthest step already rendered, so a milestone that does not
-- move the rail forward skips the Slack call entirely. Without it, every report
-- re-open would spend a chat.update to redraw an identical message.
--
-- No PII. The message body is not stored — it is rebuilt from source on each
-- update, so this table never holds an email, a name or an answer.

CREATE TABLE IF NOT EXISTS public.slack_journey_message (
  survey_submission_id BIGINT PRIMARY KEY,
  channel              TEXT NOT NULL,
  message_ts           TEXT NOT NULL,
  state                TEXT,
  -- The question count shown in the original message. Not derivable at refresh
  -- time, and re-rendering without it would silently downgrade "59 questions in
  -- 12 min" to "0 questions" on the first update.
  question_count       INTEGER,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.slack_journey_message IS
  'Slack message id per survey submission, so milestone updates edit the original notification instead of posting again. No message content stored.';
COMMENT ON COLUMN public.slack_journey_message.state IS
  'Furthest journey step already rendered; used to skip no-op chat.update calls.';

-- Service-role only, matching every other operational table here.
ALTER TABLE public.slack_journey_message ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'slack_journey_message'
       AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY service_role_only ON public.slack_journey_message
      FOR ALL USING (false);
  END IF;
END $$;

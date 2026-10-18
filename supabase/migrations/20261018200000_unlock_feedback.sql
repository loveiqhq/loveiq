-- Unlock feedback (Marcus's epic, 18 Oct 2026): three hours after a new report, an unpaid reader
-- is emailed "Why didn't you unlock your report?" with nine one-tap answers. A tap opens /why,
-- which records the answer once the page has loaded in a browser (a link scanner's GET records
-- nothing), unlocks the full report for free and asks an optional follow-up.
--
-- One row per reader (the submission), claimed by the send (app/api/cron/unlock-feedback) before
-- it emails, so a retry or a second run never sends twice. The link carries a random token; only
-- its sha256 is kept here, so this table cannot open anyone's /why page.
--
-- reason is the answer now (the page lets the reader change it), first_reason the first one, as
-- the design keeps both ("first real one kept", "changed their answer: last one kept"). note is
-- the reader's own words: personal data, masked in the admin like the raw data explorer, erased
-- with the submission (the cascade below) and by the data-subject paths.
--
-- No "mail" or "token" in a column name: those stop the team data export until classified
-- (features/admin/server/team-export.ts). Rollback: supabase/rollbacks/20261018200000_unlock_feedback_down.sql.

CREATE TABLE IF NOT EXISTS public.unlock_feedback (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  survey_submission_id bigint NOT NULL UNIQUE REFERENCES public.survey_submission(id) ON DELETE CASCADE,
  personal_report_id   bigint REFERENCES public.personal_report(id) ON DELETE SET NULL,
  link_hash            text NOT NULL UNIQUE CHECK (link_hash ~ '^[0-9a-f]{64}$'),
  subject_arm          text NOT NULL CHECK (subject_arm IN ('A', 'B', 'C', 'D')),
  reason_order         text[] NOT NULL CHECK (cardinality(reason_order) = 9),
  claimed_at           timestamptz NOT NULL DEFAULT now(),
  sent_at              timestamptz,
  resend_id            text CHECK (resend_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  reason               text CHECK (reason IN ('too_expensive', 'low_value', 'free_enough', 'unclear_content', 'result_off', 'privacy', 'checkout', 'later', 'other')),
  first_reason         text CHECK (first_reason IN ('too_expensive', 'low_value', 'free_enough', 'unclear_content', 'result_off', 'privacy', 'checkout', 'later', 'other')),
  answered_at          timestamptz,
  changed_at           timestamptz,
  answer_loads         integer NOT NULL DEFAULT 0 CHECK (answer_loads >= 0),
  chips                text[] NOT NULL DEFAULT '{}' CHECK (cardinality(chips) <= 10),
  note                 text CHECK (char_length(note) <= 2000),
  detail_at            timestamptz,
  device               text CHECK (device IN ('mobile', 'tablet', 'desktop')),
  already_paid         boolean NOT NULL DEFAULT false,
  unlocked_at          timestamptz,
  payment_id           bigint REFERENCES public.payment(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK ((reason IS NULL) = (answered_at IS NULL)),
  CHECK ((first_reason IS NULL) = (answered_at IS NULL))
);

CREATE INDEX IF NOT EXISTS unlock_feedback_sent_at_idx ON public.unlock_feedback (sent_at);

ALTER TABLE public.unlock_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unlock_feedback_service_only ON public.unlock_feedback;
CREATE POLICY unlock_feedback_service_only ON public.unlock_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.unlock_feedback FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.unlock_feedback TO service_role;

COMMENT ON TABLE public.unlock_feedback IS
  'The "why didn''t you unlock?" email and its answer: one row per reader, claimed by the send before it emails. The answer counts only once /why has loaded in a browser.';
COMMENT ON COLUMN public.unlock_feedback.link_hash IS 'sha256 (hex) of the random token in the email''s links; the token itself is never stored.';
COMMENT ON COLUMN public.unlock_feedback.subject_arm IS 'Which subject line the email had (A to D, an equal split).';
COMMENT ON COLUMN public.unlock_feedback.reason_order IS 'The order the email showed the nine answers in: the first eight rotated, "other" always last.';
COMMENT ON COLUMN public.unlock_feedback.claimed_at IS 'When the send claimed this reader, before emailing.';
COMMENT ON COLUMN public.unlock_feedback.sent_at IS 'When Resend accepted the email; null if the send failed.';
COMMENT ON COLUMN public.unlock_feedback.reason IS 'The answer now: the page lets the reader change it.';
COMMENT ON COLUMN public.unlock_feedback.first_reason IS 'The first answer the page recorded.';
COMMENT ON COLUMN public.unlock_feedback.answered_at IS 'When /why first recorded an answer (the page loaded in a browser).';
COMMENT ON COLUMN public.unlock_feedback.changed_at IS 'When the reader last changed their answer on the page.';
COMMENT ON COLUMN public.unlock_feedback.answer_loads IS 'How many times /why recorded a tap for this reader (repeat taps: the first is kept).';
COMMENT ON COLUMN public.unlock_feedback.chips IS 'The follow-up chips the reader picked, by their label.';
COMMENT ON COLUMN public.unlock_feedback.note IS 'The reader''s own words on the follow-up. Personal data: masked in the admin.';
COMMENT ON COLUMN public.unlock_feedback.detail_at IS 'When the reader last sent chips or words.';
COMMENT ON COLUMN public.unlock_feedback.device IS 'mobile, tablet or desktop, from the browser that answered.';
COMMENT ON COLUMN public.unlock_feedback.already_paid IS 'The reader had bought before answering: nothing was unlocked.';
COMMENT ON COLUMN public.unlock_feedback.unlocked_at IS 'When the free full report was granted.';
COMMENT ON COLUMN public.unlock_feedback.payment_id IS 'The free (0) payment that unlocks the report, source unlock_feedback.';

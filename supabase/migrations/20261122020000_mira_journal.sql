-- Mira's daily journal (post-MVP, 22 Nov 2026; Mark's Home board "Daily journal"). Additive only.
-- Follows 20261121030000. Rollback: supabase/rollbacks/20261122020000_mira_journal_down.sql
--
-- mira_journal_entry: one check-in per person and day, the day being the person's own calendar
--   day (their browser sends it): four areas rated 1 (very low) to 5 (very good), each optional
--   but at least one, and an optional one-line note. Special-category data (Art. 9 GDPR: mood,
--   body, closeness): only the person sees it in the app, Mira reads the last 7 days only while
--   journal_share is on and the notes only when it is 'notes', and the person can delete one entry
--   or all of them. It goes with the account (ON DELETE CASCADE) and when Mira stops someone as
--   under 18 (features/mira/server/minor.ts).
-- mira_user gains the journal's settings: journal_share ('off' unless the person turns it on) and
--   when it was last chosen (journal_share_at, the explicit consent's time); the daily reminder's
--   time in the person's time zone (journal_reminder_time, null = no reminder, on the hour or half
--   hour like the nudge cron's runs); and the local day of the last reminder claimed
--   (journal_reminded_on), so at most one goes a day (features/mira/server/journal.ts).
--
-- Service role only, like every other Mira table.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.mira_journal_entry (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.mira_user (id) ON DELETE CASCADE,
  day        date NOT NULL,
  mood       smallint CHECK (mood BETWEEN 1 AND 5),
  body       smallint CHECK (body BETWEEN 1 AND 5),
  closeness  smallint CHECK (closeness BETWEEN 1 AND 5),
  energy     smallint CHECK (energy BETWEEN 1 AND 5),
  note       text CHECK (char_length(note) BETWEEN 1 AND 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One a day; also the index for a person's entries by day.
  CONSTRAINT mira_journal_entry_one_a_day UNIQUE (user_id, day),
  CONSTRAINT mira_journal_entry_rated CHECK (num_nonnulls(mood, body, closeness, energy) >= 1)
);

ALTER TABLE public.mira_journal_entry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mira_journal_entry FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mira_journal_entry TO service_role;
DROP POLICY IF EXISTS "Service role only" ON public.mira_journal_entry;
CREATE POLICY "Service role only" ON public.mira_journal_entry
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON SEQUENCE public.mira_journal_entry_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.mira_journal_entry_id_seq TO service_role;

ALTER TABLE public.mira_user
  ADD COLUMN IF NOT EXISTS journal_share text NOT NULL DEFAULT 'off'
    CHECK (journal_share IN ('off', 'scores', 'notes')),
  ADD COLUMN IF NOT EXISTS journal_share_at timestamptz,
  ADD COLUMN IF NOT EXISTS journal_reminder_time text
    CHECK (journal_reminder_time ~ '^([01][0-9]|2[0-3]):[03]0$'),
  ADD COLUMN IF NOT EXISTS journal_reminded_on date;

COMMENT ON TABLE public.mira_journal_entry IS
  'Mira''s daily journal (features/mira/server/journal.ts): one check-in per person and local day, four areas rated 1-5 (null = skipped) and an optional one-line note. Art. 9 data: Mira reads it only while mira_user.journal_share is on.';
COMMENT ON COLUMN public.mira_journal_entry.day IS
  'The person''s own calendar day, as their browser sent it.';
COMMENT ON COLUMN public.mira_user.journal_share IS
  'What Mira may read of the daily journal: off (default), scores (the last 7 days'' ratings) or notes (the ratings and the notes).';
COMMENT ON COLUMN public.mira_user.journal_share_at IS
  'When journal_share was last chosen: the time of the explicit consent, or of its withdrawal.';
COMMENT ON COLUMN public.mira_user.journal_reminder_time IS
  'The daily journal reminder email''s time in the person''s time_zone (HH:00 or HH:30); null = no reminder.';
COMMENT ON COLUMN public.mira_user.journal_reminded_on IS
  'The local day the last journal reminder was claimed for: at most one a day.';

COMMIT;

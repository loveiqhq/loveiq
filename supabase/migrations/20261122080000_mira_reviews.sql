-- Mira's ratings and quotes (22 Nov 2026). Additive only: one new table. Follows 20261121030000.
-- Rollback: supabase/rollbacks/20261122080000_mira_reviews_down.sql
--
-- After a good moment in the chat (a 9 or 10 on the recommend question, or a third thumbs-up in
-- one chat; never near a crisis, an under-18 stop, a referral or the body check), a signed-in
-- person may rate Mira from 1 to 5 and, with a separate consent, give one sentence for others,
-- shown with the first name or initials they choose and, if they like, an age range (no photos).
-- Mira's pages show the average, how many people rated and one approved quote a day, only once
-- 20 different people who are not the team's have rated her and a quote is approved
-- (features/mira/reviews.ts). Nothing is invented: UWG Annex Nos. 23b and 23c.
--
-- mira_review: one row per account (UNIQUE user_id), so a person rates once; it goes with the
--   account (ON DELETE CASCADE). The words exist only with the consent to show them
--   (consent_version, consent_at), and are shown only once the team approved them
--   (quote_status 'approved', published_quote: the words, with any detail that could identify
--   someone replaced by a visible […], as the consent allows). Taking the words back clears them
--   ('none'); a rejection deletes them too ('rejected'): we keep no words we don't show.
--   from_team: rated from a team browser, never counted. reviewed_by: the staff address that
--   approved, rejected or took the words down.
--
-- Service role only, like every other Mira object.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.mira_review (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         uuid NOT NULL UNIQUE REFERENCES public.mira_user (id) ON DELETE CASCADE,
  stars           smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  quote           text CHECK (char_length(quote) BETWEEN 1 AND 160),
  display_name    text CHECK (char_length(display_name) BETWEEN 1 AND 24),
  age_range       text CHECK (age_range IN ('18-24', '25-34', '35-44', '45-54', '55+')),
  consent_version text CHECK (consent_version ~ '^mira-review-[0-9-]{10,13}$'),
  consent_at      timestamptz,
  quote_status    text NOT NULL DEFAULT 'none'
                    CHECK (quote_status IN ('none', 'pending', 'approved', 'rejected')),
  published_quote text CHECK (char_length(published_quote) BETWEEN 1 AND 160),
  reviewed_at     timestamptz,
  reviewed_by     text,
  from_team       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Words only with the consent to show them; shown only once approved; none kept otherwise.
  CONSTRAINT mira_review_words_need_consent CHECK (
    CASE quote_status
      WHEN 'pending' THEN quote IS NOT NULL AND display_name IS NOT NULL
        AND consent_version IS NOT NULL AND consent_at IS NOT NULL AND published_quote IS NULL
      WHEN 'approved' THEN quote IS NOT NULL AND display_name IS NOT NULL
        AND consent_version IS NOT NULL AND consent_at IS NOT NULL AND published_quote IS NOT NULL
      ELSE quote IS NULL AND display_name IS NULL AND age_range IS NULL
        AND consent_version IS NULL AND consent_at IS NULL AND published_quote IS NULL
    END
  )
);

ALTER TABLE public.mira_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mira_review FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mira_review TO service_role;
REVOKE ALL ON SEQUENCE public.mira_review_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.mira_review_id_seq TO service_role;

COMMENT ON TABLE public.mira_review IS
  'Mira ratings (1-5, one per account) and optional one-sentence quotes, shown only with the person''s versioned consent and once staff approved them (features/mira/reviews.ts, server/reviews.ts).';
COMMENT ON COLUMN public.mira_review.published_quote IS
  'The quote as approved: the person''s words, with details that could identify someone replaced by a visible […]; nothing else is changed.';
COMMENT ON COLUMN public.mira_review.from_team IS
  'Rated from a team browser (cookie loveiq_team=1 or loveiq_probe=1): never counted or shown.';

COMMIT;

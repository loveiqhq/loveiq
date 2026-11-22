-- Mira's ratings after the audit of 22 Nov 2026: why the team didn't show a quote, and where a
-- rating was given. Additive only: two columns and a check. Follows 20261122080000_mira_reviews.
-- Rollback: supabase/rollbacks/20261122110000_mira_reviews_reasons_down.sql
--
-- mira_review.reject_reason: rejecting a quote, or taking one down, needs one of four reasons
--   (features/mira/reviews.ts REJECT_REASONS): 'identifying' (the details that could identify
--   someone can't be taken out), 'harmful' (harmful or abusive), 'off_topic' (not about Mira) or
--   'spam' (spam or a duplicate). Never because the words are critical (UWG Annex no. 23c). The
--   writer sees the reason in Settings. Every new rejection has one and only a rejection has one;
--   the check is NOT VALID so that a quote rejected before this migration (none in production,
--   where the table ships with this) keeps its row without one.
-- mira_review.via: where the rating was given: 'settings' (Settings › Your rating, open at any
--   time to anyone who has talked with Mira) or 'ask' (the thank-you ask in the chat, which every
--   rating before this came from). AP › Mira's Ratings card counts the ask's ratings apart.
--
-- Apply before the code that writes them (app/api/mira/reviews, AP › Mira › Ratings) is deployed.
-- Service role only, like every other Mira object.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_review
  ADD COLUMN IF NOT EXISTS reject_reason text
    CHECK (reject_reason IN ('identifying', 'harmful', 'off_topic', 'spam')),
  ADD COLUMN IF NOT EXISTS via text NOT NULL DEFAULT 'ask' CHECK (via IN ('settings', 'ask'));

ALTER TABLE public.mira_review DROP CONSTRAINT IF EXISTS mira_review_reason_with_rejection;
ALTER TABLE public.mira_review ADD CONSTRAINT mira_review_reason_with_rejection
  CHECK ((quote_status = 'rejected') = (reject_reason IS NOT NULL)) NOT VALID;

COMMENT ON COLUMN public.mira_review.reject_reason IS
  'Why staff rejected or took down the quote: identifying, harmful, off_topic or spam (features/mira/reviews.ts REJECT_REASONS), never because it is critical. Shown to the writer in Settings.';
COMMENT ON COLUMN public.mira_review.via IS
  'Where the rating was given: settings (Settings › Your rating) or ask (the thank-you ask in the chat).';

COMMIT;

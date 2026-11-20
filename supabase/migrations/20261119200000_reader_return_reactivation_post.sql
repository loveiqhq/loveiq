-- Where a return's #report-reactivations post went, so it can be redrawn as the reader reads and
-- moves on (features/attribution/server/reactivation-post.ts): "Report time spent" fills in, and
-- the rail turns green at the paywall, the checkout and the payment. LoveIQ Sync, 19 Nov 2026:
-- Marcus's design, a channel of its own for report reactivations (#all-loveiq, 16 Nov).
-- Additive only. Rollback: supabase/rollbacks/20261119200000_reader_return_reactivation_post_down.sql
--
-- reactivation_channel / reactivation_ts: the post's channel and ts once it went out; null when
-- none did (a draft, which gets no post; the channel not set; Slack refused it). Ids only.
--
-- APPLY BEFORE THE DEPLOY THAT SETS SLACK_REACTIVATIONS_CHANNEL_ID. Without the columns every
-- post still goes out, but storing its ts is refused: supabaseFetch logs each refused write at
-- error level, which posts "write REJECTED" to #prod-alerts, and the post is never redrawn.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.reader_return
  ADD COLUMN IF NOT EXISTS reactivation_channel text,
  ADD COLUMN IF NOT EXISTS reactivation_ts text;

COMMENT ON COLUMN public.reader_return.reactivation_channel IS
  'The #report-reactivations post''s channel once posted (reactivation-post.ts); null when none went out.';
COMMENT ON COLUMN public.reader_return.reactivation_ts IS
  'The #report-reactivations post''s ts once posted, for its redraws; null when none went out.';

COMMIT;

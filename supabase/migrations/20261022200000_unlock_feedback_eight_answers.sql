-- The unlock-feedback email as it ships (22 Oct 2026), over 20261018200000 to 20261019120000,
-- which staging already ran and production runs just before this one.
--
-- 1. Mark's eight answers (22.10): time_commitment is new; checkout and later are no longer
--    offered. The checks still accept those two keys, so staging's earlier test rows stay valid.
-- 2. send_batch: which sender claimed the row, the hourly cron, the admin's test, or a tranche
--    ('tranche:<name>'), so a tranche's answers can be read apart from fresh readers'.
-- 3. The hourly sends start OFF. The first tranche (Mark and Eman, 22.10: 250 readers) goes
--    from the admin's button on AP-Analytics, and the team turns the cron on when it decides.
--
-- Rollback: supabase/rollbacks/20261022200000_unlock_feedback_eight_answers_down.sql.

BEGIN;

ALTER TABLE public.unlock_feedback DROP CONSTRAINT IF EXISTS unlock_feedback_reason_check;
ALTER TABLE public.unlock_feedback ADD CONSTRAINT unlock_feedback_reason_check CHECK (
  reason IN ('too_expensive', 'low_value', 'free_enough', 'unclear_content', 'result_off',
             'privacy', 'time_commitment', 'other', 'checkout', 'later')
);

ALTER TABLE public.unlock_feedback DROP CONSTRAINT IF EXISTS unlock_feedback_first_reason_check;
ALTER TABLE public.unlock_feedback ADD CONSTRAINT unlock_feedback_first_reason_check CHECK (
  first_reason IN ('too_expensive', 'low_value', 'free_enough', 'unclear_content', 'result_off',
                   'privacy', 'time_commitment', 'other', 'checkout', 'later')
);

ALTER TABLE public.unlock_feedback DROP CONSTRAINT IF EXISTS unlock_feedback_reason_order_check;
ALTER TABLE public.unlock_feedback ADD CONSTRAINT unlock_feedback_reason_order_check CHECK (
  cardinality(reason_order) IN (8, 9)
);

ALTER TABLE public.unlock_feedback
  ADD COLUMN IF NOT EXISTS send_batch text NOT NULL DEFAULT 'hourly'
  CHECK (send_batch ~ '^(hourly|test|tranche:[a-z0-9_-]{1,40})$');

COMMENT ON COLUMN public.unlock_feedback.reason_order IS
  'The order the email showed the answers in: all but "other" rotated, "other" always last (eight from 22 Oct 2026, nine before).';
COMMENT ON COLUMN public.unlock_feedback.send_batch IS
  'Which sender claimed the row: hourly (the cron), test (an admin''s own test) or tranche:<name> (an admin''s tranche).';

UPDATE public.system_flags SET enabled = false WHERE key = 'unlock_feedback';

COMMIT;

-- Rollback of 20261022200000_unlock_feedback_eight_answers. A row answered time_commitment
-- would break the nine-key check, so those answers become 'other' first (the reader's words,
-- if any, stay in note). The flag is left as it is: turning the sends back on is a decision.

BEGIN;

UPDATE public.unlock_feedback SET reason = 'other' WHERE reason = 'time_commitment';
UPDATE public.unlock_feedback SET first_reason = 'other' WHERE first_reason = 'time_commitment';

ALTER TABLE public.unlock_feedback DROP CONSTRAINT IF EXISTS unlock_feedback_reason_check;
ALTER TABLE public.unlock_feedback ADD CONSTRAINT unlock_feedback_reason_check CHECK (
  reason IN ('too_expensive', 'low_value', 'free_enough', 'unclear_content', 'result_off',
             'privacy', 'checkout', 'later', 'other')
);
ALTER TABLE public.unlock_feedback DROP CONSTRAINT IF EXISTS unlock_feedback_first_reason_check;
ALTER TABLE public.unlock_feedback ADD CONSTRAINT unlock_feedback_first_reason_check CHECK (
  first_reason IN ('too_expensive', 'low_value', 'free_enough', 'unclear_content', 'result_off',
                   'privacy', 'checkout', 'later', 'other')
);

ALTER TABLE public.unlock_feedback DROP COLUMN IF EXISTS send_batch;

COMMIT;

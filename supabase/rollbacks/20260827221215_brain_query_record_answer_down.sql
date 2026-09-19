-- Reverse of 20260827221215.
--
-- Drops the recorded answer text. Note this is the only place an answer is ever
-- stored, so rolling back permanently discards the audit trail for every question
-- answered since it was added — there is no other copy.

ALTER TABLE public.brain_query DROP COLUMN IF EXISTS answer;

-- Rollback for 20261011190000_answer_correlations: the function is new and nothing else
-- depends on it, so dropping it restores the schema exactly.

DROP FUNCTION IF EXISTS public.get_answer_correlations(timestamp with time zone, timestamp with time zone, integer, numeric);

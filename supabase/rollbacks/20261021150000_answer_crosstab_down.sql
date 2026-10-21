-- Rollback for 20261021150000_answer_crosstab: the function is new and nothing else depends on
-- it, so dropping it restores the schema exactly. Jarvis's descriptions name it, so roll the
-- code back too, or query_product_data answers "No such table" when a crosstab is asked for.

DROP FUNCTION IF EXISTS public.get_answer_crosstab(text, text[], text, jsonb, date, date);

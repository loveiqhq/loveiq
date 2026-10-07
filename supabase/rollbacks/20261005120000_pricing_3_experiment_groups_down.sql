-- Rollback for 20261005120000_pricing_3_experiment_groups.
--
-- Narrows the CHECK back to the 2.x arms. Only possible while NO row carries A3/B3:
-- once 3.0 has quoted or sold anyone, those rows need the wider CHECK, and the block
-- below refuses rather than fail halfway. Roll back 20261005120100 first; rows the 3.0
-- code created itself still keep A3/B3, so in practice this is for a launch abandoned
-- before any reader saw it.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.report_price_quote WHERE experiment_group IN ('A3', 'B3')) THEN
    RAISE EXCEPTION 'report_price_quote still has A3/B3 rows; the CHECK cannot be narrowed';
  END IF;
END
$$;

ALTER TABLE public.report_price_quote
  DROP CONSTRAINT report_price_quote_experiment_group_check,
  ADD CONSTRAINT report_price_quote_experiment_group_check
    CHECK (experiment_group = ANY (ARRAY['A'::text, 'B'::text]));

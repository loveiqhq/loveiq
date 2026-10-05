-- Pricing 3.0: let report_price_quote.experiment_group hold the new arms, A3 and B3.
--
-- APPLY BEFORE THE CODE DEPLOYS. From the deploy on, every fresh quote is stamped A3
-- or B3 (features/pricing/logic/reportPricing.ts, `pricingArmForReport`), and under
-- the old CHECK (A, B) each of those inserts fails: the paygate would read "Pricing
-- unavailable" for every reader who has no quote yet.
--
-- A and B stay valid. They are the concluded 2.x test's arms, and every row bought
-- under it keeps them. Nothing is rewritten here; the re-sync of unpurchased quotes is
-- 20261005120100, applied after the deploy.

ALTER TABLE public.report_price_quote
  DROP CONSTRAINT report_price_quote_experiment_group_check,
  ADD CONSTRAINT report_price_quote_experiment_group_check
    CHECK (experiment_group = ANY (ARRAY['A'::text, 'B'::text, 'A3'::text, 'B3'::text]));

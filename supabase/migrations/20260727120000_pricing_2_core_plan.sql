-- Pricing 2.0: allow the new "core" plan ("All your core archetypes" — unlocks
-- the buyer's top-3 archetypes at full_report tier) alongside the existing plans.
--
-- Purely additive: widens two CHECK constraints so a `core` quote / share row can
-- be written. No existing rows change (they only ever hold the three legacy
-- values, all still permitted), so the re-validation on ADD CONSTRAINT is a no-op.
-- Without this, opening the pricing modal on the core tier fails at quote
-- creation, and a core buyer sharing their report fails at the share insert.

ALTER TABLE report_price_quote DROP CONSTRAINT IF EXISTS report_price_quote_plan_check;
ALTER TABLE report_price_quote
  ADD CONSTRAINT report_price_quote_plan_check
  CHECK (plan = ANY (ARRAY['essentials'::text, 'full_report'::text, 'core'::text, 'all_reports'::text]));

ALTER TABLE report_share DROP CONSTRAINT IF EXISTS report_share_plan_at_share_check;
ALTER TABLE report_share
  ADD CONSTRAINT report_share_plan_at_share_check
  CHECK (plan_at_share = ANY (ARRAY['essentials'::text, 'full_report'::text, 'core'::text, 'all_reports'::text]));

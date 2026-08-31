-- Rollback for 20260831101238_retire_pricing_bucket_a.
--
-- Restores the pricing 2.1 arm-A price list on UNPURCHASED quotes stamped
-- experiment_group = 'A'. Rows stamped 'B' already carried these numbers and are
-- left alone; purchased rows were never touched by the forward migration and are
-- not touched here either.
--
-- This is exact, and it is exact ONLY because the forward migration deliberately
-- did not realign `experiment_group`. That decision was made to preserve the
-- concluded test's per-arm quote denominators; making the rollback possible was a
-- second consequence of it. Verified at rollback-authoring time: every unpurchased
-- row is stamped 'A' (2,657) or 'B' (2,622) — no legacy 'C' rows to guess at.
--
-- ONE THING THIS CANNOT UNDO: the forward migration deleted
-- `metadata.sessionLocks` from 561 rows. Those locks are gone and are not
-- recoverable from anywhere. The practical effect of not restoring them is that a
-- returning visitor gets a freshly derived price instead of a previously locked
-- one, which is the safe direction — it is also why they were cleared.
--
-- Running this WITHOUT also reverting features/pricing/logic/reportPricing.ts
-- leaves the database holding arm-A prices that the code can no longer generate.
-- That is survivable (the engine reads msrp/starting off the row, so those readers
-- keep the higher price) but it is not a state to sit in — revert the code too.
--
-- Prices restored (pricing 2.1, from 20260824120000):
--   full_report  A  msrp 45.99  charged 39.99
--   core         A  msrp 54.99  charged 49.99
--   all_reports  A  msrp 64.99  charged 59.00
--   essentials   A  msrp 29.99  charged  9.99  (grandfathered; unchanged either way)

UPDATE report_price_quote q SET
  msrp              = v.msrp,
  base_price        = v.msrp,
  starting_price    = v.starting,
  initial_price     = v.starting,
  current_price     = v.starting,
  discount_step     = 0,
  updated_date_time = now()
FROM (VALUES
  ('full_report'::text, 45.99::numeric, 39.99::numeric),
  ('core',              54.99,          49.99),
  ('all_reports',       64.99,          59.00),
  ('essentials',        29.99,           9.99)
) AS v(plan, msrp, starting)
WHERE q.plan = v.plan
  AND q.experiment_group = 'A'
  AND q.purchased_at IS NULL;

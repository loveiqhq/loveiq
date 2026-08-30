-- Flag the pre-launch test purchases so they stop being counted as revenue.
--
-- Reported 2026-08-28: our revenue figure said EUR 1,099.29 while the real Stripe
-- balance was 500-600. Reconciled against the live Stripe account and the gap is
-- NOT coupons (coupon use is real and already inside the true figure — that is why
-- there are 3.74 and 4.99 charges against 29/39/49 list prices). It is two Stripe
-- accounts being added together:
--
--   charge ids containing EC6NWLxfs5  ->  39 payments, EUR 634.91  (current account,
--                                          matches live Stripe to the cent, 36 distinct
--                                          customers)
--   charge ids containing EOOls8qn9F  ->  12 payments, EUR 464.38  (an account we no
--                                          longer use, 14 Apr - 2 May)
--
-- Those 12 are staff testing, not customers: they come from only THREE email
-- addresses — one of them the developer's own personal address with 9 purchases in
-- 19 days, one a @loveiq.org address, one beginning "te" — and include two charges
-- of EUR 129.49, a price this product has never sold at.
--
-- Why a flag and not a status change: `status = 'succeeded'` is what
-- features/report/server/planAccess.ts and personalReport.ts read to resolve which
-- access plan a report has. Rewriting the status to exclude these rows from revenue
-- would revoke those reports. The rows stay exactly as they are; reporting learns to
-- skip them.
--
-- Reversible: `update payment set is_test = false where is_test;`

alter table payment
  add column if not exists is_test boolean not null default false;

comment on column payment.is_test is
  'True for internal/staff test transactions that must never count as revenue. '
  'Set for the 12 pre-launch payments on the retired Stripe account (charge ids '
  'containing EOOls8qn9F). Deliberately NOT expressed as a status change, because '
  'status = ''succeeded'' is what resolves report access plans.';

update payment
   set is_test = true
 where stripe_charge_id like '%EOOls8qn9F%';

-- Revenue queries filter on this, so an index keeps the common
-- `status = 'succeeded' and not is_test` scan cheap as the table grows.
create index if not exists payment_is_test_idx on payment (is_test) where not is_test;

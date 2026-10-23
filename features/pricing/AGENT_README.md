# features/pricing

**Purpose:** Report-purchase pricing math + quote snapshots. Used by `features/checkout/` (build session) and `features/report/` (display "buy" CTAs).

**Entry:**

- `logic/reportPricing.ts` — quote builder, plan price lookup, snapshot serializer. `PLAN_BUCKETS` holds Pricing 3.0's two lists; `pricingArmForReport` picks a reader's (`A3`/`B3`) from their report id, the same rule the re-sync migration uses in SQL. A pay-to-start report, a report in the €1.99 gate's cohort and an initial-unlock holder get `A3` on their first quote, whatever the id (`pinsListPrice`: what the caller passes in the context, the rest looked up).
- `report_price_quote_arm_history` (migration `20261016170000`) — every change to a quote's arm (`experiment_group`) or list price (`msrp`, `starting_price`), written by a trigger. A re-sync of unpaid quotes keeps this history automatically, so an ended test can still be read in the list each quote was dealt (`dealtArm` in `features/admin/server/experiment-readouts.ts`). A re-sync no longer needs a metadata copy for measurement. Its rollback still needs one for the columns the history does not keep (`base_price`, `initial_price`, `discount_step`, `base_price_bucket`, `pricing_cluster_id`).
- Credits, read once per report by `getReportCredits`: All 14 takes off what was already paid (`applyUpgradeCredit`), and a full-report quote on `A3` takes €10 off after the initial unlock, paid or gifted by E07 (`applyInitialCredit`, `creditKind: "initial"`, Marcus 19.10), once: the first full report bought uses it up. A quote on another arm keeps its price.

**Belongs:** pricing math, currency, discount/coupon evaluation, quote snapshots.

**Does NOT belong:**

- Stripe wiring (lives in `features/checkout/server/stripeCheckout.ts`).
- Purchase fulfillment (lives in `features/checkout/server/fulfillment.ts`).
- Report rendering.

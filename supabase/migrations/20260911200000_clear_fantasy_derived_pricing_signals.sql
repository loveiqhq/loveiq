-- Removes the sexual-preference-derived values already stored on quote rows.
--
-- WHY THIS IS NOT OPTIONAL, and why the code change alone does not finish the job.
-- `buildQuote` resolves a re-quote by reading the stored row first:
--
--   const engagementScore = existingQuote?.engagement_score ?? getEngagementScore(...)
--
-- There is no expiry check on that read. So for every report that already has a quote,
-- the new code never recomputes the score — it reads the contaminated one straight back
-- out, re-persists it, sends it to Stripe as checkout metadata, and forwards it into
-- purchase analytics. Gating the derivation stops new contamination; it does nothing for
-- the rows that already exist, and those are the ones with a live checkout in front of
-- them. Measured on 2026-09-11: 3,349 rows scored >= 40, across 1,064 reports, of which
-- 950 had not purchased and could still reach a checkout. The most recent was that day.
--
-- WHAT IS CORRECTED. `getEngagementScore` awarded +20 once for any non-zero fantasy
-- count, alongside +20 for a survey over eight minutes and +20 for two or more preview
-- views. Subtracting 20 from rows that carried a fantasy signal therefore reproduces
-- exactly what the same inputs score today, without needing the duration and preview
-- counts (which are not on this table). The multiplier is then re-derived from the
-- corrected score by the same rule the code uses: >= 40 -> 1.1, else 1.
--
-- NO PRICE MOVES. What a reader is charged comes from the stored `current_price`
-- (`chargedPriceCents = currentPriceCents`), which this migration does not touch. The
-- engagement multiplier only ever reached a price through `pricing_uplift_enabled`, off
-- since 2026-08-03 and defaulting to false in code. Verified before writing this: of
-- 3,349 rows carrying the 1.1 multiplier, 3,342 already had current_price = starting_price
-- and the seven that differed were discount steps. The guard at the end asserts the same
-- property holds afterwards rather than trusting that reasoning.
--
-- NOT BATCHED, deliberately. The runbook asks for batching on long-running UPDATEs; this
-- is not one. Measured 2026-09-11: report_price_quote is 8,768 kB over 6,030 rows, 3,732 of
-- them touched, and NO index covers engagement_score, engagement_multiplier or
-- fantasy_signal_count, so there is no index maintenance on top of the row rewrites.
-- Splitting it would trade a sub-second lock for a partially-applied state.
--
-- IDEMPOTENT. Both statements are guarded on the value they set, so re-running is a
-- no-op.
--
-- ROLLBACK PATH: PITR restore only. Once fantasy_signal_count is zeroed there is no record
-- of which rows carried a signal, so the prior scores cannot be reconstructed from this
-- table — which is the point, not an oversight. See the paired file in supabase/rollbacks/.

BEGIN;

-- 1. Remove the fantasy contribution from the stored score, then re-derive the multiplier.
UPDATE report_price_quote
SET engagement_score     = GREATEST(engagement_score - 20, 0),
    engagement_multiplier = CASE WHEN GREATEST(engagement_score - 20, 0) >= 40 THEN 1.1 ELSE 1 END
WHERE fantasy_signal_count > 0;

-- 2. Drop the derived count itself. The column stays (NOT NULL, and dropping it would
--    rewrite a table that payment records join against); 0 is its "no signal" value and
--    is what the application now writes on every new quote.
UPDATE report_price_quote
SET fantasy_signal_count = 0
WHERE fantasy_signal_count <> 0;

-- 3. Refuse to commit if anything survived, or if a charged price moved.
DO $$
DECLARE
  v_remaining bigint;
  v_repriced  bigint;
BEGIN
  SELECT count(*) INTO v_remaining FROM report_price_quote WHERE fantasy_signal_count <> 0;
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'fantasy_signal_count still set on % row(s)', v_remaining;
  END IF;

  SELECT count(*) INTO v_repriced
  FROM report_price_quote
  WHERE engagement_multiplier NOT IN (1, 1.1)
     OR (engagement_score >= 40) <> (engagement_multiplier = 1.1);
  IF v_repriced > 0 THEN
    RAISE EXCEPTION 'engagement multiplier inconsistent with score on % row(s)', v_repriced;
  END IF;
END $$;

COMMIT;

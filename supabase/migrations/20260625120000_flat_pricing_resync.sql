-- Flat-pricing re-sync (2026-06 pricing reset).
--
-- The pricing engine moved to flat per-tier prices (Essentials EUR 9.99,
-- Full EUR 14.99, all_reports EUR 29.99) and removed both the per-user uplift
-- and the 14-day time-decay ladder. Existing UNPURCHASED quotes still carry
-- their old stored msrp/starting_price, and buildQuotePayload reuses those
-- stored values on re-quote -- so expiring alone would keep the old prices.
-- We therefore null msrp/starting_price (forcing a fall-back to the new
-- catalogue) AND expire the quote (forcing a fresh initial-price recompute on
-- next view).
--
-- Purchased quotes (purchased_at IS NOT NULL) are left FROZEN -- never re-price
-- what someone already paid. Idempotency metadata (nurtureEmailsSent,
-- chapterNudgesSent, ...) is preserved; only the per-session price locks are
-- dropped so a returning visitor re-prices at the new flat number.
--
-- Run AFTER the new pricing code is live in prod, else quotes regenerate
-- against the old config. Safe to re-run (idempotent).

update public.report_price_quote
   set expires_at        = now(),
       msrp              = null,
       starting_price    = null,
       metadata          = metadata - 'sessionLocks',
       updated_date_time = now()
 where purchased_at is null;

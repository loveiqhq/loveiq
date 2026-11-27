-- Choose your price: one EUR 0 choice per report, held by the database.
--
-- EUR 0 on the price test's "Choose your price" page is a succeeded EUR 0 `initial` payment whose
-- metadata.priceOption is 'free' (grantChosenFreeInitialUnlock, features/report/server/
-- initialUnlockGift.ts). It looks for the report's initial unlock before it writes one, so two
-- requests at the same moment could both find none and write two (pre-merge review of #799,
-- 27 Nov 2026). Nothing counted money twice (the EUR 10 credit is set, not added; AP counts a free
-- claim once per survey), but the ledger showed two claims. This index refuses the second insert
-- (PostgREST answers 409), and that request then answers with the first one's row. Partial: only
-- these rows are indexed, and no other insert is affected. Checked before applying: no report
-- holds two such rows (production 2 rows in all, staging none).
--
-- CONCURRENTLY, like every index on payment (20260531131925): a live table. It cannot run
-- inside a transaction block. Rollback:
-- supabase/rollbacks/20261127210000_payment_chosen_free_once_down.sql.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS payment_chosen_free_once
  ON public.payment (personal_report_id)
  WHERE metadata->>'priceOption' = 'free';

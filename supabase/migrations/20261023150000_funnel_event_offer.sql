-- Pay to start's two pages apart in the visit count (AP-Analytics, Pay to start: Marcus's
-- "Funnel metrics compared", 23.10). A visit to /sexual-archetype or /sexual-archetype/initial
-- is labelled `pay_to_start` in landing_variant (proxy.ts), the same label for both, so the
-- EUR 29.99 and EUR 1.99 offers could not each have a visit → paying customer rate.
--
--   offer  which pay-to-start offer's page the visit landed on: 'full' (EUR 29.99,
--          /sexual-archetype) or 'pre' (EUR 1.99, /sexual-archetype/initial). NULL on every
--          other visit, and on pay-to-start visits recorded before this column.
--
-- Additive only: a nullable column and its CHECK. The label stays as it is, so every reader
-- that leaves `pay_to_start` out of the free funnel (20261018130000, ap_facts' callers) is
-- untouched. Apply it before the code that writes it: PostgREST refuses a whole insert that
-- names a column it does not know, and a refused visit is a lost one.
-- Rollback: supabase/rollbacks/20261023150000_funnel_event_offer_down.sql

BEGIN;

ALTER TABLE public.funnel_event ADD COLUMN IF NOT EXISTS offer text;

ALTER TABLE public.funnel_event DROP CONSTRAINT IF EXISTS funnel_event_offer_check;
ALTER TABLE public.funnel_event
  ADD CONSTRAINT funnel_event_offer_check CHECK (offer IS NULL OR offer IN ('full', 'pre'));

COMMENT ON COLUMN public.funnel_event.offer IS
  'Pay to start: the offer whose page the visit landed on (full | pre); NULL elsewhere.';

NOTIFY pgrst, 'reload schema';

COMMIT;

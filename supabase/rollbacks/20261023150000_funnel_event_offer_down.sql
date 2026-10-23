-- Rollback of 20261023150000_funnel_event_offer. Deploy code that no longer writes `offer`
-- first: an insert naming a dropped column is refused whole, and the visit is lost.

BEGIN;

ALTER TABLE public.funnel_event DROP CONSTRAINT IF EXISTS funnel_event_offer_check;
ALTER TABLE public.funnel_event DROP COLUMN IF EXISTS offer;

NOTIFY pgrst, 'reload schema';

COMMIT;

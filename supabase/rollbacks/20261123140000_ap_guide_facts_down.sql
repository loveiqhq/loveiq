-- Rollback for 20261123140000_ap_guide_facts. FIRST deploy an AP survey page that no longer calls
-- it (features/admin/server/ap/guide.ts): without the function the page leaves the guide's table
-- out and logs a warning, so the order is not critical, but the warning would repeat on every
-- read. Nothing else reads it; funnel_event and its rows are untouched.

DROP FUNCTION IF EXISTS public.ap_guide_facts(date, date);

NOTIFY pgrst, 'reload schema';

-- Rollback for 20261018210100_ap_report_tour: the function is new and only the AP Report page
-- reads it (app/api/admin/ap/report/route.ts), so dropping it restores the schema exactly. The
-- page keeps working without it: its guided tour section says it could not be read.

DROP FUNCTION IF EXISTS public.ap_report_tour(date, date);

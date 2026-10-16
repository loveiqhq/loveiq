-- Rollback for 20261012120000_kpi_week: the function is new and only the kpi-weekly cron
-- calls it, so dropping it restores the schema exactly. The cron then fails closed
-- (nothing written) until the function is back.

DROP FUNCTION IF EXISTS public.get_kpi_week(timestamp with time zone, timestamp with time zone);

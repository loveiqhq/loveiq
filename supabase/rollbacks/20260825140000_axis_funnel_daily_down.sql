-- Rollback for 20260825140000_axis_funnel_daily.
-- Safe to run: the function is read-only and only the conversion digest calls it.
DROP FUNCTION IF EXISTS public.get_axis_funnel_daily(TIMESTAMPTZ, TIMESTAMPTZ);

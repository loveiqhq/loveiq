-- Rollback for 20261012003000_survey_dropoff_runs: the function is new and only the
-- kpi-dropoff cron calls it, so dropping it restores the schema exactly. The cron then fails
-- closed (nothing written) until the function is back.

DROP FUNCTION IF EXISTS public.get_survey_dropoff_runs(timestamp with time zone, timestamp with time zone);

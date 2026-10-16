-- Rollback for 20261014120100_survey_event_tablet. FIRST deploy a route that no longer
-- writes is_tablet: PostgREST refuses a whole insert naming a column that does not exist,
-- and every survey step would be lost. Then put ap_facts back to a version that does not
-- read the column (20261014130000 reads it, and a SQL function only fails when called), and
-- drop it.

ALTER TABLE public.survey_behavior_event DROP COLUMN IF EXISTS is_tablet;

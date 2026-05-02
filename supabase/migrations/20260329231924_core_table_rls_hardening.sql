-- Migration: Harden scoring_result and survey_partial_save table access

-- ---------------------------------------------------------------------------
-- 1. scoring_result
-- ---------------------------------------------------------------------------

ALTER TABLE public.scoring_result ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.scoring_result;

CREATE POLICY service_role_only
ON public.scoring_result
FOR ALL
USING (false)
WITH CHECK (false);

REVOKE ALL ON TABLE public.scoring_result FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.scoring_result TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'scoring_result_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.scoring_result_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.scoring_result_id_seq TO service_role;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. survey_partial_save
-- ---------------------------------------------------------------------------

ALTER TABLE public.survey_partial_save ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.survey_partial_save;

CREATE POLICY service_role_only
ON public.survey_partial_save
FOR ALL
USING (false)
WITH CHECK (false);

REVOKE ALL ON TABLE public.survey_partial_save FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.survey_partial_save TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'survey_partial_save_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.survey_partial_save_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.survey_partial_save_id_seq TO service_role;
  END IF;
END;
$$;;

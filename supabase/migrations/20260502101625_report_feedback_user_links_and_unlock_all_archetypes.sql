-- Link report_section_feedback rows directly to user + submission so feedback
-- survives sessionStorage gaps (e.g. user opens report from email on a fresh
-- device, where the survey session UUID is not in storage).
ALTER TABLE public.report_section_feedback
  ADD COLUMN IF NOT EXISTS survey_submission_id bigint
    REFERENCES public.survey_submission(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id bigint
    REFERENCES public.app_user(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS personal_report_id bigint
    REFERENCES public.personal_report(id) ON DELETE SET NULL;

-- Backfill from existing session_id -> survey_submission match.
UPDATE public.report_section_feedback f
   SET survey_submission_id = ss.id,
       user_id              = ss.user_id,
       personal_report_id   = pr.id
  FROM public.survey_submission ss
  LEFT JOIN public.personal_report pr ON pr.survey_submission_id = ss.id
 WHERE f.session_id = ss.session_id
   AND f.survey_submission_id IS NULL;

-- session_id is no longer required: future inserts may arrive via token only.
ALTER TABLE public.report_section_feedback
  ALTER COLUMN session_id DROP NOT NULL;

-- Canonical dedup key. Legacy (session_id, section_id) UNIQUE is replaced
-- because session_id may now be NULL.
ALTER TABLE public.report_section_feedback
  DROP CONSTRAINT IF EXISTS report_section_feedback_session_id_section_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS report_section_feedback_submission_section_uq
  ON public.report_section_feedback (survey_submission_id, section_id)
  WHERE survey_submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_report_feedback_user
  ON public.report_section_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_report_feedback_submission
  ON public.report_section_feedback (survey_submission_id);
CREATE INDEX IF NOT EXISTS idx_report_feedback_personal_report
  ON public.report_section_feedback (personal_report_id);

-- All-reports plan unlock: bulk-set every archetype to full_report tier on a
-- personal_report. The existing upsert_archetype_tier RPC only handles a
-- single archetype, so the all_reports webhook path was previously skipping
-- the tier write entirely (lib/checkout/fulfillment.ts only handled
-- essentials + full_report).
CREATE OR REPLACE FUNCTION public.unlock_all_archetypes(
  p_personal_report_id bigint,
  p_archetype_names text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
  tiers jsonb;
BEGIN
  IF p_archetype_names IS NULL OR array_length(p_archetype_names, 1) = 0 THEN
    RAISE EXCEPTION 'archetype_names_required' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_object_agg(name, 'full_report')
    INTO tiers
    FROM unnest(p_archetype_names) AS t(name);

  UPDATE personal_report
     SET archetype_tiers = COALESCE(archetype_tiers, '{}'::jsonb) || COALESCE(tiers, '{}'::jsonb),
         unlocked_archetypes = ARRAY(
           SELECT k FROM jsonb_object_keys(
             COALESCE(archetype_tiers, '{}'::jsonb) || COALESCE(tiers, '{}'::jsonb)
           ) AS t(k)
           ORDER BY k
         )
   WHERE id = p_personal_report_id
   RETURNING archetype_tiers INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'personal_report_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_all_archetypes(bigint, text[]) TO service_role;

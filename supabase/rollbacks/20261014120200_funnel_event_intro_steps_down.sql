-- Rollback for 20261014120200_funnel_event_intro_steps. FIRST deploy a survey page and a
-- /api/funnel-event that no longer send these steps. Narrows the CHECK back to the set
-- 20260919200000 wrote. Only possible while NO row carries one of the steps: once a visitor
-- has sent one, the block below refuses rather than delete them. Export and delete them first,
-- deliberately, or leave the CHECK as it is.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.funnel_event
     WHERE event_type IN ('intro_view', 'consent_view', 'consent_back',
                          'intro_back_1', 'intro_back_2', 'intro_back_3', 'intro_back_4',
                          'intro_skip_1', 'intro_skip_2', 'intro_skip_3', 'intro_skip_4')
  ) THEN
    RAISE EXCEPTION 'funnel_event still has intro step rows; the CHECK cannot be narrowed';
  END IF;
END
$$;

ALTER TABLE public.funnel_event
  DROP CONSTRAINT funnel_event_event_type_check,
  ADD CONSTRAINT funnel_event_event_type_check
    CHECK (
      event_type = ANY (
        ARRAY[
          'unique_visitor',
          'survey_engine_mount',
          'survey_page_view',
          'intro_slide_1',
          'intro_slide_2',
          'intro_slide_3',
          'intro_slide_4',
          'prepaid_gate_viewed',
          'prepaid_checkout_started'
        ]::text[]
      )
    );

-- Rollback for 20261123130000_funnel_event_guide_steps. FIRST deploy a survey page and a
-- /api/funnel-event that no longer send these steps (the `survey_2` switch off is not enough:
-- the page sends them for any run resumed on Survey 2.0). Narrows the CHECK back to the set
-- 20261014120200 wrote. Only possible while NO row carries one of the steps: once a visitor has
-- sent one, the block below refuses rather than delete them. Export and delete them first,
-- deliberately, or leave the CHECK as it is.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.funnel_event
     WHERE event_type IN ('guide_card_1', 'guide_card_2', 'guide_card_3',
                          'guide_back_2', 'guide_back_3',
                          'guide_skip_1', 'guide_skip_2', 'guide_skip_3')
  ) THEN
    RAISE EXCEPTION 'funnel_event still has short guide rows; the CHECK cannot be narrowed';
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
          'prepaid_checkout_started',
          'intro_view',
          'consent_view',
          'intro_back_1',
          'intro_back_2',
          'intro_back_3',
          'intro_back_4',
          'intro_skip_1',
          'intro_skip_2',
          'intro_skip_3',
          'intro_skip_4',
          'consent_back'
        ]::text[]
      )
    );

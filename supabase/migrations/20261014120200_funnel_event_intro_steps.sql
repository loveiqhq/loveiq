-- funnel_event: the intro cards' own steps, so AP-Analytics can show Time, Reached, Continue,
-- Skip intro, Back and Exit for every card before question 1 (Marcus's design, 2026-10-14).
-- Until now only the four slides recorded anything (intro_slide_1..4).
--
--   intro_view        the intro ("Let's prepare you") was shown
--   consent_view      the consent ("Before we begin") was shown
--   intro_back_1..4   went back from slide N: the Back button, the left arrow key, a swipe or
--                     the browser's Back (slide 1 has only the browser's)
--   intro_skip_1..4   pressed Skip Intro on slide N
--   consent_back      went back from the consent (only the browser's Back can)
--
-- Same writer and consent posture as intro_slide_*: the browser posts them to
-- /api/funnel-event with the __liq_vid cookie, which exists only once the cookie banner is
-- accepted, so they cover the visitors who accepted. One row per visitor, UTC day and step,
-- as before. Leaving is not sent: the readers take each visitor's furthest card that day.
--
-- APPLY BEFORE DEPLOYING the page and route that send them: the CHECK refuses an unknown
-- value, and the route logs a refused insert at warn only, so those rows would be lost
-- without anyone seeing it.
--
-- Only the CHECK constraint changes. It is rewritten in full, as 20260919200000 did, after
-- asserting that the live set is still exactly the one that migration wrote: replacing a set
-- that has gained a value since would remove it and start refusing writes that work today.

DO $migration$
DECLARE
  current_def TEXT;
  current_vals TEXT[];
  expected TEXT[] := ARRAY[
    'unique_visitor', 'survey_engine_mount', 'survey_page_view',
    'intro_slide_1', 'intro_slide_2', 'intro_slide_3', 'intro_slide_4',
    'prepaid_gate_viewed', 'prepaid_checkout_started'
  ];
BEGIN
  SELECT pg_get_constraintdef(con.oid) INTO current_def
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'funnel_event'
     AND con.conname = 'funnel_event_event_type_check';

  IF current_def IS NULL THEN
    RAISE EXCEPTION
      'funnel_event_event_type_check not found — refusing to guess at the allowed event set';
  END IF;

  -- Idempotent.
  IF position('consent_back' IN current_def) > 0 THEN
    RAISE NOTICE 'funnel_event already allows the intro steps — nothing to do';
    RETURN;
  END IF;

  SELECT array_agg(m.v[1]) INTO current_vals
    FROM regexp_matches(current_def, '''([a-z0-9_]+)''', 'g') AS m(v);
  IF current_vals IS NULL OR NOT (current_vals @> expected AND expected @> current_vals) THEN
    RAISE EXCEPTION
      'the allowed event set is not the one this migration was written against (%) — re-read it before re-running',
      current_def;
  END IF;

  ALTER TABLE public.funnel_event
    DROP CONSTRAINT funnel_event_event_type_check;

  ALTER TABLE public.funnel_event
    ADD CONSTRAINT funnel_event_event_type_check
    CHECK (
      event_type = ANY (
        ARRAY[
          'unique_visitor',
          -- Browser-posted, needs the __liq_vid cookie, so consent-gated.
          'survey_engine_mount',
          -- Server-written sibling of unique_visitor. Consent-independent.
          'survey_page_view',
          'intro_slide_1',
          'intro_slide_2',
          'intro_slide_3',
          'intro_slide_4',
          'prepaid_gate_viewed',
          'prepaid_checkout_started',
          -- The intro cards' own steps (this migration). Browser-posted, consent-gated.
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

  RAISE NOTICE 'funnel_event now allows the intro steps';
END
$migration$;

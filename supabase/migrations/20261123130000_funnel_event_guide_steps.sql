-- funnel_event: Survey 2.0's short guide (Mark's Pre Survey Wizard, 23 Nov 2026), so AP-Analytics
-- can show its three cards as it shows the intro's today. Survey 2.0 replaces the intro ("Let's
-- prepare you well") and its four slides with three cards under a "Short guide" header; the
-- consent after them keeps consent_view and consent_back.
--
--   guide_card_1..3   card N was shown (1: three rules, 2: the perspective of today, 3: privacy)
--   guide_back_2..3   went back from card N: the Back button, the left arrow key, a swipe or the
--                     browser's Back (card 1 has none: it is the page's first entry, and the
--                     browser's Back leaves the page from it, as from the intro)
--   guide_skip_1..3   pressed Skip Intro on card N
--
-- Same writer and rules as the intro's steps (20261014120200): the browser posts them to
-- /api/funnel-event for every visitor, one row per visitor, UTC day and step. Only runs on Survey
-- 2.0 send them, and only while its switch (`survey_2`) is on or under a staging preview.
--
-- APPLY BEFORE DEPLOYING the page and route that send them: the CHECK refuses an unknown value,
-- and the route logs a refused insert at warn only, so those rows would be lost unseen.
--
-- Only the CHECK constraint changes. It is rewritten in full, as 20261014120200 did, after
-- asserting that the live set is still exactly the one that migration wrote: replacing a set that
-- has gained a value since would remove it and start refusing writes that work today.
-- Rollback: supabase/rollbacks/20261123130000_funnel_event_guide_steps_down.sql

DO $migration$
DECLARE
  current_def TEXT;
  current_vals TEXT[];
  expected TEXT[] := ARRAY[
    'unique_visitor', 'survey_engine_mount', 'survey_page_view',
    'intro_slide_1', 'intro_slide_2', 'intro_slide_3', 'intro_slide_4',
    'prepaid_gate_viewed', 'prepaid_checkout_started',
    'intro_view', 'consent_view',
    'intro_back_1', 'intro_back_2', 'intro_back_3', 'intro_back_4',
    'intro_skip_1', 'intro_skip_2', 'intro_skip_3', 'intro_skip_4',
    'consent_back'
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
  IF position('guide_card_1' IN current_def) > 0 THEN
    RAISE NOTICE 'funnel_event already allows the short guide steps — nothing to do';
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
          -- Browser-posted for every visitor (the cookie's id, or a page-only id without it).
          'survey_engine_mount',
          -- Server-written sibling of unique_visitor. Consent-independent.
          'survey_page_view',
          'intro_slide_1',
          'intro_slide_2',
          'intro_slide_3',
          'intro_slide_4',
          'prepaid_gate_viewed',
          'prepaid_checkout_started',
          -- The intro cards' own steps (20261014120200). Browser-posted, for every visitor.
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
          'consent_back',
          -- Survey 2.0's short guide (this migration). Browser-posted, for every visitor.
          'guide_card_1',
          'guide_card_2',
          'guide_card_3',
          'guide_back_2',
          'guide_back_3',
          'guide_skip_1',
          'guide_skip_2',
          'guide_skip_3'
        ]::text[]
      )
    );

  RAISE NOTICE 'funnel_event now allows the short guide steps';
END
$migration$;

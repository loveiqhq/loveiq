-- A survey-start count that is not gated on cookie consent.
--
-- THE PROBLEM. The funnel's top two rows were measured by two instruments that
-- disagree about who counts, and /admin read the difference between them as a
-- behaviour.
--
--   `unique_visitor`      written SERVER-side by recordUniqueVisit with a
--                         throwaway per-day UUID. Complete, and deliberately
--                         consent-independent — it replaced an earlier client
--                         pinger that "massively under-counted".
--
--   `survey_engine_mount` posted by the BROWSER, keyed on the `__liq_vid`
--                         cookie — which proxy.ts mints only AFTER the visitor
--                         clicks Accept. So it is consent-gated.
--
-- Measured 2026-09-19 over 30 days: 637 visitors reached the consent-gated step
-- against 977 server-written survey drafts past question one. And the ids are
-- unrelated — of 3,172 mount ids all time only 632 (20%) ever appear as a
-- `unique_visitor` id, because one is a per-day random UUID and the other a
-- persistent cookie value. The two could not be compared person to person even
-- in principle, yet /admin's journey flow labelled the gap between them
-- "Bounced on landing", which is a causal claim about roughly a third of people
-- who had in fact only declined cookies.
--
-- THE FIX. `survey_page_view`: same writer, same id scheme, same Berlin day
-- clock and the same consent posture as `unique_visitor`, written from the
-- survey page's server component via after().
--
-- A NEW EVENT TYPE, NOT A CHANGE TO THE OLD ONE. Three reasons:
--   * the existing `survey_engine_mount` series keeps its meaning, so historical
--     charts are not silently restated;
--   * nothing is double counted, because the two use different event_type values
--     and the primary key is (visitor_id, day, event_type);
--   * the DIFFERENCE between them is a direct, ongoing readout of the consent
--     gap — worth being able to see rather than estimate.
--
-- There is no backfill and there cannot be one: the rows that would have been
-- written do not exist, and inventing them would assert something false. The
-- series starts the day this deploys, and any chart crossing that date has a
-- discontinuity that has to be labelled rather than smoothed.
--
-- Only the CHECK constraint changes. No new column, no index, no data touched —
-- the table already has the right shape, it was just not allowed to hold this
-- value.

DO $migration$
DECLARE
  current_def TEXT;
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
  IF position('survey_page_view' IN current_def) > 0 THEN
    RAISE NOTICE 'funnel_event already allows survey_page_view — nothing to do';
    RETURN;
  END IF;

  /*
   * Asserted, not assumed. The constraint is rewritten in full below, so if the
   * live one has gained a value since this migration was written, replacing it
   * blindly would REMOVE that value and start rejecting writes that work today.
   * Checked against the definition read 2026-09-19.
   */
  IF position('prepaid_checkout_started' IN current_def) = 0
     OR position('intro_slide_4' IN current_def) = 0
     OR position('survey_engine_mount' IN current_def) = 0 THEN
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
          'prepaid_checkout_started'
        ]::text[]
      )
    );

  RAISE NOTICE 'funnel_event now allows survey_page_view';
END
$migration$;

COMMENT ON TABLE public.funnel_event IS
  'Top-of-funnel signals that predate survey_submission. One row per '
  '(visitor_id, day, event_type). TWO WRITERS WITH DIFFERENT CONSENT POSTURES: '
  '`unique_visitor` and `survey_page_view` are written server-side with a '
  'throwaway per-day UUID and are consent-independent; `survey_engine_mount` and '
  '`intro_slide_*` are posted by the browser using the __liq_vid cookie, which '
  'only exists after the visitor accepts cookies. Do not divide one kind by the '
  'other.';

-- White pay-first funnel coverage (2026-06-14).
--
-- The white landing A/B variant must pay €9.99 BEFORE the survey. People who
-- reach that gate and leave without paying were invisible — the gate fired no
-- analytics at all. We now ping two funnel_event signals (keyed by visitor_id +
-- day, like unique_visitor / survey_engine_mount / intro_slide_*, because they
-- predate any survey_submission):
--   • prepaid_gate_viewed       — visitor saw the €9.99 gate (price + pay button)
--   • prepaid_checkout_started  — visitor clicked "Pay & start test"
--
-- Drop-off is then queryable: prepaid_gate_viewed → prepaid_checkout_started →
-- prepaid_report_access(status='succeeded'). This migration just widens the
-- event_type CHECK to admit the two new types (the route + client must agree).
--
-- Same dynamic drop+re-add as 20260529120000 (inline CHECKs are autonamed, so we
-- look the constraint up by definition rather than by a guessed name). Idempotent.

DO $$
DECLARE
  cname TEXT;
BEGIN
  FOR cname IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.funnel_event'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.funnel_event DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

ALTER TABLE public.funnel_event
  ADD CONSTRAINT funnel_event_event_type_check CHECK (
    event_type IN (
      'unique_visitor',
      'survey_engine_mount',
      'intro_slide_1',
      'intro_slide_2',
      'intro_slide_3',
      'intro_slide_4',
      'prepaid_gate_viewed',
      'prepaid_checkout_started'
    )
  );

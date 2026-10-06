-- Four SECURITY DEFINER functions were callable by anyone holding the anon key.
--
-- SECURITY DEFINER bypasses row level security, so these reach data the anon
-- role cannot read directly. Measured with the published anon key on
-- 2026-09-17, before this migration:
--
--   get_survey_friction        returned our per-question funnel analytics —
--                              visits, abandons, backs, median time per question
--   brain_title_word_frequency returned the corpus title-word distribution
--   get_report_friction        same shape, for the report and paywall
--   get_event_stats            refused the table asked for; it has its own
--                              allowlist, so it was the one already guarded
--
-- The anon key ships in the browser bundle and this repository is public, so
-- "callable by anon" means callable by anyone at all.
--
-- Every caller is server-side and uses the service role: friction-metrics.ts
-- for the two friction functions, scripts/brain-battery.ts for the other two.
-- No browser path calls any of them, so revoking costs nothing. service_role is
-- granted back explicitly because REVOKE ... FROM PUBLIC takes it away too.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_survey_friction(timestamptz, timestamptz)',
    'public.get_report_friction(timestamptz, timestamptz)',
    'public.get_event_stats(text, text, timestamptz, timestamptz, integer)',
    'public.brain_title_word_frequency(numeric)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

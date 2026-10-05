-- Close the last table in `public` with row level security switched off.
--
-- The database linter flags this at ERROR level, EXTERNAL facing, and it is the
-- only one left: everything else either has RLS on or is deliberately readable.
-- Verified with the published anon key on 2026-09-17 — it returned the whole
-- table, including the `noted` column, which describes our own corpus structure
-- ("our own chunk-part suffix", "source label on every Drive document"). This
-- repository is public and the anon key ships in the browser bundle.
--
-- SAFE, and that was checked rather than assumed. Two readers exist:
--
--   * `brain_search`, which is SECURITY INVOKER. An anon caller already gets
--     nothing out of it, because `brain_chunk` has RLS and returns no rows to
--     anon — measured: brain_search as anon returns [], as service role returns
--     results. So the stopword subquery inside it cannot change an anon-visible
--     answer, because there is no anon-visible answer to change.
--   * `scripts/brain-battery.ts`, which uses the service role and bypasses RLS.
--
-- No policy is created, which is the same deny-all posture as cron_run,
-- funnel_event and ux_finding.
ALTER TABLE public.brain_title_stopword ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.brain_title_stopword IS
  'Structural title words brain_search skips. RLS on with no policy: service-role readers only.';

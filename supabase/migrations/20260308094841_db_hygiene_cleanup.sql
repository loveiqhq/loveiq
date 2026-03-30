
-- 1. Drop legacy survey_responses table (0 rows, unused)
DROP TABLE IF EXISTS survey_responses;

-- 2. Remove dead RLS policy on rate_limits (qual: false blocks everything, but the other policy overrides it)
DROP POLICY IF EXISTS "service_role_only" ON rate_limits;

-- 3. Remove overly permissive allow_public_insert on waitlist_signups
-- Keeps "Service role can insert" and "Service role can select"
DROP POLICY IF EXISTS "allow_public_insert" ON waitlist_signups;

-- 4. Enable pg_cron and schedule stale rate_limits cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule(
  'cleanup-stale-rate-limits',
  '0 3 * * *',
  $$DELETE FROM public.rate_limits WHERE updated_at < NOW() - INTERVAL '24 hours'$$
);
;

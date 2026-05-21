-- Three Supabase security advisor follow-ups bundled. All flagged by the
-- security advisor after the 2026-05-18 nurture / slack-alert work.
-- Applied via Supabase MCP on 2026-05-22; this file is the canonical record.

BEGIN;

-- 1. slack_alert_sent (created 2026-05-18 in 20260518150000_create_slack_alert_sent.sql)
--    was missing RLS — advisor flagged as ERROR rls_disabled_in_public. Enable
--    RLS + service_role_only policy matching every other table in the schema.
ALTER TABLE slack_alert_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON slack_alert_sent FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. report_access_token + report_section_feedback had RLS enabled but no
--    policies → advisor INFO rls_enabled_no_policy. Service-role bypasses
--    RLS so app code already works, but add the explicit policy so the
--    intent is auditable and consistent with the rest of the schema.
CREATE POLICY service_role_only ON report_access_token FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY service_role_only ON report_section_feedback FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3. Three SECURITY DEFINER RPCs missed by the earlier 20260430 + 20260501
--    lockdown migrations were still callable by anon/authenticated. Revoke
--    execute so only the service-role key can invoke them, matching the
--    lockdown of every other RPC in the schema.
REVOKE EXECUTE ON FUNCTION public.find_stuck_payments(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_stuck_payments(integer) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.unlock_all_archetypes(bigint, text[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unlock_all_archetypes(bigint, text[]) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.upsert_archetype_tier(bigint, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_archetype_tier(bigint, text, text) FROM PUBLIC;

COMMIT;

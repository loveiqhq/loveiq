-- Supabase performance advisor flagged 11 admin_* table policies for
-- auth_rls_initplan: they call current_setting('request.jwt.claims', true)
-- per row instead of once per query, recomputing the JWT-claims lookup
-- for every scanned row. Wrap the call in a scalar subquery so Postgres
-- evaluates it once via initplan and reuses the result for every row.
--
-- Applied via Supabase MCP on 2026-05-22; this file is the canonical record.

BEGIN;

DROP POLICY IF EXISTS service_role_only ON admin_audit_log;
CREATE POLICY service_role_only ON admin_audit_log FOR ALL
  USING ((SELECT current_setting('request.jwt.claims', true))::jsonb ->> 'role' = 'service_role');

DROP POLICY IF EXISTS service_role_only ON admin_chart_annotation;
CREATE POLICY service_role_only ON admin_chart_annotation FOR ALL
  USING ((SELECT current_setting('request.jwt.claims', true))::jsonb ->> 'role' = 'service_role');

DROP POLICY IF EXISTS service_role_only ON admin_experiment;
CREATE POLICY service_role_only ON admin_experiment FOR ALL
  USING ((SELECT current_setting('request.jwt.claims', true))::jsonb ->> 'role' = 'service_role');

DROP POLICY IF EXISTS service_role_only ON admin_experiment_metric;
CREATE POLICY service_role_only ON admin_experiment_metric FOR ALL
  USING ((SELECT current_setting('request.jwt.claims', true))::jsonb ->> 'role' = 'service_role');

DROP POLICY IF EXISTS service_role_only ON admin_export_preset;
CREATE POLICY service_role_only ON admin_export_preset FOR ALL
  USING ((SELECT current_setting('request.jwt.claims', true))::jsonb ->> 'role' = 'service_role');

DROP POLICY IF EXISTS service_role_only ON admin_goals;
CREATE POLICY service_role_only ON admin_goals FOR ALL
  USING ((SELECT current_setting('request.jwt.claims', true))::jsonb ->> 'role' = 'service_role');

DROP POLICY IF EXISTS service_role_only ON admin_metric_benchmark;
CREATE POLICY service_role_only ON admin_metric_benchmark FOR ALL
  USING ((SELECT current_setting('request.jwt.claims', true))::jsonb ->> 'role' = 'service_role');

DROP POLICY IF EXISTS service_role_only ON admin_note;
CREATE POLICY service_role_only ON admin_note FOR ALL
  USING ((SELECT current_setting('request.jwt.claims', true))::jsonb ->> 'role' = 'service_role');

DROP POLICY IF EXISTS service_role_only ON admin_saved_view;
CREATE POLICY service_role_only ON admin_saved_view FOR ALL
  USING ((SELECT current_setting('request.jwt.claims', true))::jsonb ->> 'role' = 'service_role');

DROP POLICY IF EXISTS service_role_only ON admin_tag_rules;
CREATE POLICY service_role_only ON admin_tag_rules FOR ALL
  USING ((SELECT current_setting('request.jwt.claims', true))::jsonb ->> 'role' = 'service_role');

DROP POLICY IF EXISTS service_role_only ON admin_users;
CREATE POLICY service_role_only ON admin_users FOR ALL
  USING ((SELECT current_setting('request.jwt.claims', true))::jsonb ->> 'role' = 'service_role');

COMMIT;

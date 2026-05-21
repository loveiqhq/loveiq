-- Self-audit follow-ups after the three 2026-05-22 audit migrations.
-- Applied via Supabase MCP on 2026-05-22; this file is the canonical record.
--
-- Bug 1: 20260522120000_v9_db_question_sync.sql inserted Q16015 with
--        required=false. data/survey-data.ts line 1474 has required=true
--        (the TS file drives the runtime survey UI — it is authoritative).
--        Align the DB row.
--
-- Bug 2: The same migration inserted Q16015 without a
--        survey_question_mapping row. Every other survey_question has 1
--        mapping row to survey_id=1 (the active survey). Add the link.
--
-- Bug 3: 20260522120200_admin_rls_initplan.sql rewrote 11 admin_*
--        policies but missed three more flagged by the perf advisor:
--        submission_tag, submission_tag_assignment, product_changelog.
--        Apply the same per-row → initplan rewrite.

BEGIN;

-- Bug 1: required=false → true
UPDATE survey_question
SET required = true, updated_date_time = now()
WHERE frontend_qid = '16015';

-- Bug 2: link Q16015 to the active survey (idempotent on re-run)
INSERT INTO survey_question_mapping (survey_id, question_id)
SELECT 1, sq.id
FROM survey_question sq
WHERE sq.frontend_qid = '16015'
  AND NOT EXISTS (
    SELECT 1 FROM survey_question_mapping m
    WHERE m.question_id = sq.id AND m.survey_id = 1
  );

-- Bug 3: three admin tables missed in the previous rewrite. Same
--        per-row current_setting → (SELECT current_setting) pattern.
DROP POLICY IF EXISTS service_role_only ON submission_tag;
CREATE POLICY service_role_only ON submission_tag FOR ALL
  USING ((SELECT current_setting('request.jwt.claims', true))::jsonb ->> 'role' = 'service_role');

DROP POLICY IF EXISTS service_role_only ON submission_tag_assignment;
CREATE POLICY service_role_only ON submission_tag_assignment FOR ALL
  USING ((SELECT current_setting('request.jwt.claims', true))::jsonb ->> 'role' = 'service_role');

DROP POLICY IF EXISTS service_role_only ON product_changelog;
CREATE POLICY service_role_only ON product_changelog FOR ALL
  USING ((SELECT current_setting('request.jwt.claims', true))::jsonb ->> 'role' = 'service_role');

COMMIT;

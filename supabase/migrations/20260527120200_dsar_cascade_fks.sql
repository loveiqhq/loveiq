-- P-01: ON DELETE CASCADE for the DSAR delete cascade path
--
-- Problem: the original schema declared FKs with no ON DELETE clause, which
-- defaults to RESTRICT. The DSAR helper in features/admin/server/data-subject.ts
-- walks tables manually in dependency order, but a transient Supabase error
-- mid-walk leaves orphans + a parent DELETE that throws an FK violation.
-- Real-world failure shape: tier-1 (waitlist/invite/suppression) gone, then a
-- 500 on survey_submission_answer DELETE, then survey_submission DELETE throws.
--
-- Fix: declare CASCADE on every child FK whose parent might be deleted via
-- DSAR. Each ALTER drops the existing constraint and recreates it with
-- ON DELETE CASCADE. Side effect: an accidental personal_report deletion now
-- cleans up its children automatically (which we want).
--
-- Note: payment table is intentionally excluded (retained for accounting per
-- §147 AO + §257 HGB). The payment.personal_report_id FK was set to
-- SET NULL in 20260527120000 so personal_report deletion no longer blocks.
--
-- AccessExclusiveLock on each table during the ALTER. At current scale
-- (<100K rows on any individual table) this is a sub-second operation.

BEGIN;

-- analytics_event: 4 FKs, all should cascade for DSAR
ALTER TABLE analytics_event DROP CONSTRAINT analytics_event_session_id_fkey;
ALTER TABLE analytics_event
  ADD CONSTRAINT analytics_event_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES report_session(id) ON DELETE CASCADE;

ALTER TABLE analytics_event DROP CONSTRAINT analytics_event_user_id_fkey;
ALTER TABLE analytics_event
  ADD CONSTRAINT analytics_event_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE;

ALTER TABLE analytics_event DROP CONSTRAINT analytics_event_personal_report_id_fkey;
ALTER TABLE analytics_event
  ADD CONSTRAINT analytics_event_personal_report_id_fkey
  FOREIGN KEY (personal_report_id) REFERENCES personal_report(id) ON DELETE CASCADE;

ALTER TABLE analytics_event DROP CONSTRAINT analytics_event_survey_submission_id_fkey;
ALTER TABLE analytics_event
  ADD CONSTRAINT analytics_event_survey_submission_id_fkey
  FOREIGN KEY (survey_submission_id) REFERENCES survey_submission(id) ON DELETE CASCADE;

-- survey_submission_answer: children of survey_submission. Cascade so we can
-- delete survey_submission in one shot if needed.
ALTER TABLE survey_submission_answer DROP CONSTRAINT fk_ssa_submission;
ALTER TABLE survey_submission_answer
  ADD CONSTRAINT fk_ssa_submission
  FOREIGN KEY (survey_submission_id) REFERENCES survey_submission(id) ON DELETE CASCADE;

-- survey_submission_answer_options + history: children of
-- survey_submission_answer. With cascade these die automatically when the
-- parent answer goes.
ALTER TABLE survey_submission_answer_options DROP CONSTRAINT fk_ssao_ssa;
ALTER TABLE survey_submission_answer_options
  ADD CONSTRAINT fk_ssao_ssa
  FOREIGN KEY (survey_submission_answer_id) REFERENCES survey_submission_answer(id) ON DELETE CASCADE;

ALTER TABLE survey_submission_answer_history DROP CONSTRAINT fk_ssah_ssa;
ALTER TABLE survey_submission_answer_history
  ADD CONSTRAINT fk_ssah_ssa
  FOREIGN KEY (survey_submission_answer_id) REFERENCES survey_submission_answer(id) ON DELETE CASCADE;

-- scoring_result: child of survey_submission.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'public.scoring_result'::regclass
    AND contype = 'f'
    AND pg_get_constraintdef(oid) ILIKE '%survey_submission_id%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE scoring_result DROP CONSTRAINT %I', cname);
  END IF;
END $$;
ALTER TABLE scoring_result
  ADD CONSTRAINT scoring_result_survey_submission_id_fkey
  FOREIGN KEY (survey_submission_id) REFERENCES survey_submission(id) ON DELETE CASCADE;

-- personal_report → survey_submission cascade. Survey_submission deletion
-- now also drops the personal_report. Without this DSAR would 500 on the
-- survey_submission DELETE while a personal_report still references it.
ALTER TABLE personal_report DROP CONSTRAINT fk_personal_report_submission;
ALTER TABLE personal_report
  ADD CONSTRAINT fk_personal_report_submission
  FOREIGN KEY (survey_submission_id) REFERENCES survey_submission(id) ON DELETE CASCADE;

-- report_access_email → personal_report
ALTER TABLE report_access_email DROP CONSTRAINT fk_rae_personal_report;
ALTER TABLE report_access_email
  ADD CONSTRAINT fk_rae_personal_report
  FOREIGN KEY (personal_report_id) REFERENCES personal_report(id) ON DELETE CASCADE;

-- report_access_token → survey_submission. The token is keyed directly on
-- survey_submission_id in prod (there is NO report_access_email_id column on
-- this table). CASCADE so a DSAR survey_submission delete removes its access
-- tokens instead of being blocked by this FK (it was previously NO ACTION).
ALTER TABLE report_access_token DROP CONSTRAINT report_access_token_survey_submission_id_fkey;
ALTER TABLE report_access_token
  ADD CONSTRAINT report_access_token_survey_submission_id_fkey
  FOREIGN KEY (survey_submission_id) REFERENCES survey_submission(id) ON DELETE CASCADE;

-- personal_report_section → personal_report
ALTER TABLE personal_report_section DROP CONSTRAINT fk_prs_personal_report;
ALTER TABLE personal_report_section
  ADD CONSTRAINT fk_prs_personal_report
  FOREIGN KEY (personal_report_id) REFERENCES personal_report(id) ON DELETE CASCADE;

-- survey_submission → app_user
ALTER TABLE survey_submission DROP CONSTRAINT fk_survey_submission_user;
ALTER TABLE survey_submission
  ADD CONSTRAINT fk_survey_submission_user
  FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE;

-- report_section_rating → personal_report_section. report_section_rating
-- carries the user's thumbs-up/down + optional `comment` text — user-authored
-- data that must be deleted. Without cascade, the personal_report_section
-- DELETE earlier in the migration would throw if ratings exist.
ALTER TABLE report_section_rating DROP CONSTRAINT fk_rating_prs;
ALTER TABLE report_section_rating
  ADD CONSTRAINT fk_rating_prs
  FOREIGN KEY (personal_report_section_id) REFERENCES personal_report_section(id) ON DELETE CASCADE;

-- report_session → personal_report + app_user. report_session stores
-- ip_address + user_agent which is user data. Without cascade, deleting an
-- app_user or personal_report throws when any session exists.
ALTER TABLE report_session DROP CONSTRAINT report_session_personal_report_id_fkey;
ALTER TABLE report_session
  ADD CONSTRAINT report_session_personal_report_id_fkey
  FOREIGN KEY (personal_report_id) REFERENCES personal_report(id) ON DELETE CASCADE;

ALTER TABLE report_session DROP CONSTRAINT report_session_user_id_fkey;
ALTER TABLE report_session
  ADD CONSTRAINT report_session_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE;

-- user_interactions → app_user. Per-section engagement events; same DSAR
-- gap pattern as analytics_event.
ALTER TABLE user_interactions DROP CONSTRAINT fk_user_interactions_user;
ALTER TABLE user_interactions
  ADD CONSTRAINT fk_user_interactions_user
  FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE;

-- waitlist_mapping is a join row; once the app_user goes, the mapping
-- to a waitlist row is meaningless and would block app_user deletion.
ALTER TABLE waitlist_mapping DROP CONSTRAINT fk_waitlist_mapping_user;
ALTER TABLE waitlist_mapping
  ADD CONSTRAINT fk_waitlist_mapping_user
  FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE;

COMMIT;

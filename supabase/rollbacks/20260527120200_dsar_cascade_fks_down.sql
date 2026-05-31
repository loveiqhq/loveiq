-- DOWN migration for 20260527120200_dsar_cascade_fks.sql.
--
-- Reverts every FK the forward migration switched to ON DELETE CASCADE back to
-- the original ON DELETE RESTRICT (no ON DELETE clause = RESTRICT default).
--
-- WARNING: rows already removed by a cascade while this migration was live are
-- NOT restored — RESTRICT only governs FUTURE deletes. Reverting also
-- re-introduces the DSAR mid-cascade failure mode the forward migration fixed
-- (a parent DELETE throws an FK violation when a child still references it),
-- so only run this if a cascade is causing unwanted deletions and you must
-- stop it while you investigate.
--
-- One exception to "exact mirror": scoring_result's original FK name was
-- resolved dynamically by the forward migration, which renamed it to
-- scoring_result_survey_submission_id_fkey. This rollback keeps that name (the
-- pre-migration name is not recoverable) but restores RESTRICT semantics.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260527120200_dsar_cascade_fks_down.sql

BEGIN;

-- analytics_event: 4 FKs back to RESTRICT
ALTER TABLE analytics_event DROP CONSTRAINT analytics_event_session_id_fkey;
ALTER TABLE analytics_event
  ADD CONSTRAINT analytics_event_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES report_session(id);

ALTER TABLE analytics_event DROP CONSTRAINT analytics_event_user_id_fkey;
ALTER TABLE analytics_event
  ADD CONSTRAINT analytics_event_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES app_user(id);

ALTER TABLE analytics_event DROP CONSTRAINT analytics_event_personal_report_id_fkey;
ALTER TABLE analytics_event
  ADD CONSTRAINT analytics_event_personal_report_id_fkey
  FOREIGN KEY (personal_report_id) REFERENCES personal_report(id);

ALTER TABLE analytics_event DROP CONSTRAINT analytics_event_survey_submission_id_fkey;
ALTER TABLE analytics_event
  ADD CONSTRAINT analytics_event_survey_submission_id_fkey
  FOREIGN KEY (survey_submission_id) REFERENCES survey_submission(id);

-- survey_submission_answer → survey_submission
ALTER TABLE survey_submission_answer DROP CONSTRAINT fk_ssa_submission;
ALTER TABLE survey_submission_answer
  ADD CONSTRAINT fk_ssa_submission
  FOREIGN KEY (survey_submission_id) REFERENCES survey_submission(id);

-- survey_submission_answer_options + history → survey_submission_answer
ALTER TABLE survey_submission_answer_options DROP CONSTRAINT fk_ssao_ssa;
ALTER TABLE survey_submission_answer_options
  ADD CONSTRAINT fk_ssao_ssa
  FOREIGN KEY (survey_submission_answer_id) REFERENCES survey_submission_answer(id);

ALTER TABLE survey_submission_answer_history DROP CONSTRAINT fk_ssah_ssa;
ALTER TABLE survey_submission_answer_history
  ADD CONSTRAINT fk_ssah_ssa
  FOREIGN KEY (survey_submission_answer_id) REFERENCES survey_submission_answer(id);

-- scoring_result → survey_submission (see header note on the constraint name)
ALTER TABLE scoring_result DROP CONSTRAINT scoring_result_survey_submission_id_fkey;
ALTER TABLE scoring_result
  ADD CONSTRAINT scoring_result_survey_submission_id_fkey
  FOREIGN KEY (survey_submission_id) REFERENCES survey_submission(id);

-- personal_report → survey_submission
ALTER TABLE personal_report DROP CONSTRAINT fk_personal_report_submission;
ALTER TABLE personal_report
  ADD CONSTRAINT fk_personal_report_submission
  FOREIGN KEY (survey_submission_id) REFERENCES survey_submission(id);

-- report_access_email → personal_report
ALTER TABLE report_access_email DROP CONSTRAINT fk_rae_personal_report;
ALTER TABLE report_access_email
  ADD CONSTRAINT fk_rae_personal_report
  FOREIGN KEY (personal_report_id) REFERENCES personal_report(id);

-- report_access_token → survey_submission (back to NO ACTION)
ALTER TABLE report_access_token DROP CONSTRAINT report_access_token_survey_submission_id_fkey;
ALTER TABLE report_access_token
  ADD CONSTRAINT report_access_token_survey_submission_id_fkey
  FOREIGN KEY (survey_submission_id) REFERENCES survey_submission(id);

-- personal_report_section → personal_report
ALTER TABLE personal_report_section DROP CONSTRAINT fk_prs_personal_report;
ALTER TABLE personal_report_section
  ADD CONSTRAINT fk_prs_personal_report
  FOREIGN KEY (personal_report_id) REFERENCES personal_report(id);

-- survey_submission → app_user
ALTER TABLE survey_submission DROP CONSTRAINT fk_survey_submission_user;
ALTER TABLE survey_submission
  ADD CONSTRAINT fk_survey_submission_user
  FOREIGN KEY (user_id) REFERENCES app_user(id);

-- report_section_rating → personal_report_section
ALTER TABLE report_section_rating DROP CONSTRAINT fk_rating_prs;
ALTER TABLE report_section_rating
  ADD CONSTRAINT fk_rating_prs
  FOREIGN KEY (personal_report_section_id) REFERENCES personal_report_section(id);

-- report_session → personal_report + app_user
ALTER TABLE report_session DROP CONSTRAINT report_session_personal_report_id_fkey;
ALTER TABLE report_session
  ADD CONSTRAINT report_session_personal_report_id_fkey
  FOREIGN KEY (personal_report_id) REFERENCES personal_report(id);

ALTER TABLE report_session DROP CONSTRAINT report_session_user_id_fkey;
ALTER TABLE report_session
  ADD CONSTRAINT report_session_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES app_user(id);

-- user_interactions → app_user
ALTER TABLE user_interactions DROP CONSTRAINT fk_user_interactions_user;
ALTER TABLE user_interactions
  ADD CONSTRAINT fk_user_interactions_user
  FOREIGN KEY (user_id) REFERENCES app_user(id);

-- waitlist_mapping → app_user
ALTER TABLE waitlist_mapping DROP CONSTRAINT fk_waitlist_mapping_user;
ALTER TABLE waitlist_mapping
  ADD CONSTRAINT fk_waitlist_mapping_user
  FOREIGN KEY (user_id) REFERENCES app_user(id);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Cover remaining 28 unindexed foreign keys
-- ═══════════════════════════════════════════════════════════════════════════
-- Round 7 covered the 10 hottest FKs. Supabase performance advisor still
-- flagged 28 more spread across analytics, admin, survey-answer, and
-- report-section join tables. Cheap to add even at MVP scale; removes the
-- sequential-scan footgun for any future parent-side cascade or join.

CREATE INDEX IF NOT EXISTS idx_admin_research_repository_entry_linked_action_id
  ON public.admin_research_repository_entry (linked_action_id);
CREATE INDEX IF NOT EXISTS idx_admin_tag_rules_tag_id
  ON public.admin_tag_rules (tag_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_personal_report_id
  ON public.analytics_event (personal_report_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_session_id
  ON public.analytics_event (session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_survey_submission_id
  ON public.analytics_event (survey_submission_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_user_id
  ON public.analytics_event (user_id);
CREATE INDEX IF NOT EXISTS idx_answer_option_survey_question_id
  ON public.answer_option (survey_question_id);
CREATE INDEX IF NOT EXISTS idx_payment_item_payment_id
  ON public.payment_item (payment_id);
CREATE INDEX IF NOT EXISTS idx_personal_report_section_payment_id
  ON public.personal_report_section (payment_id);
CREATE INDEX IF NOT EXISTS idx_personal_report_section_personal_report_id
  ON public.personal_report_section (personal_report_id);
CREATE INDEX IF NOT EXISTS idx_personal_report_section_report_section_id
  ON public.personal_report_section (report_section_id);
CREATE INDEX IF NOT EXISTS idx_report_access_email_personal_report_id
  ON public.report_access_email (personal_report_id);
CREATE INDEX IF NOT EXISTS idx_report_section_report_id
  ON public.report_section (report_id);
CREATE INDEX IF NOT EXISTS idx_report_section_kpi_report_id
  ON public.report_section_kpi (report_id);
CREATE INDEX IF NOT EXISTS idx_report_section_kpi_section_id
  ON public.report_section_kpi (report_section_id);
CREATE INDEX IF NOT EXISTS idx_report_section_rating_prs_id
  ON public.report_section_rating (personal_report_section_id);
CREATE INDEX IF NOT EXISTS idx_survey_report_id
  ON public.survey (report_id);
CREATE INDEX IF NOT EXISTS idx_survey_question_kpi_question_id
  ON public.survey_question_kpi (survey_question_id);
CREATE INDEX IF NOT EXISTS idx_survey_question_kpi_survey_id
  ON public.survey_question_kpi (survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_question_mapping_question_id
  ON public.survey_question_mapping (question_id);
CREATE INDEX IF NOT EXISTS idx_survey_submission_answer_answer_option_id
  ON public.survey_submission_answer (answer_option_id);
CREATE INDEX IF NOT EXISTS idx_survey_submission_answer_survey_question_id
  ON public.survey_submission_answer (survey_question_id);
CREATE INDEX IF NOT EXISTS idx_survey_submission_answer_survey_submission_id
  ON public.survey_submission_answer (survey_submission_id);
CREATE INDEX IF NOT EXISTS idx_survey_submission_answer_history_ssa_id
  ON public.survey_submission_answer_history (survey_submission_answer_id);
CREATE INDEX IF NOT EXISTS idx_survey_submission_answer_options_answer_option_id
  ON public.survey_submission_answer_options (answer_option_id);
CREATE INDEX IF NOT EXISTS idx_survey_submission_answer_options_ssa_id
  ON public.survey_submission_answer_options (survey_submission_answer_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_id
  ON public.user_interactions (user_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_mapping_user_id
  ON public.waitlist_mapping (user_id);

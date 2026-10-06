-- ═══════════════════════════════════════════════════════════════════════════
-- Cover unindexed foreign keys on hot transactional tables
-- ═══════════════════════════════════════════════════════════════════════════
-- Supabase performance advisor flagged 10 FK columns lacking indexes. Without
-- a covering index, every parent-side delete or join triggers a sequential
-- scan of the child table. Pre-launch tables are small so we skip
-- CONCURRENTLY; future migrations on populated tables should use CONCURRENTLY.
--
-- Naming: idx_<table>_<column> — matches existing project pattern.

CREATE INDEX IF NOT EXISTS idx_payment_personal_report_id
  ON public.payment (personal_report_id);

CREATE INDEX IF NOT EXISTS idx_payment_user_id
  ON public.payment (user_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_event_payment_id
  ON public.payment_webhook_event (payment_id);

CREATE INDEX IF NOT EXISTS idx_personal_report_payment_id
  ON public.personal_report (payment_id);

CREATE INDEX IF NOT EXISTS idx_personal_report_report_id
  ON public.personal_report (report_id);

CREATE INDEX IF NOT EXISTS idx_report_session_personal_report_id
  ON public.report_session (personal_report_id);

CREATE INDEX IF NOT EXISTS idx_report_session_user_id
  ON public.report_session (user_id);

CREATE INDEX IF NOT EXISTS idx_report_share_shared_by_user_id
  ON public.report_share (shared_by_user_id);

CREATE INDEX IF NOT EXISTS idx_survey_submission_survey_id
  ON public.survey_submission (survey_id);

CREATE INDEX IF NOT EXISTS idx_survey_submission_user_id
  ON public.survey_submission (user_id);

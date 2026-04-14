-- Migration: Normalized LoveIQ schema (26+ tables)
--
-- Run this in Supabase SQL Editor BEFORE running the seed or RPC migrations.
-- Tables are created in FK-dependency order. All tables use RLS with
-- service_role_only access (matching the rate_limits pattern).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. user_profile
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_profile (
  id                  bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  last_name           text,
  password_hash       text,
  gender              text,
  birthday            date,
  sexual_orientation  text,
  relationship_status text,
  location_primary    text,
  language_primary    text,
  challenges          text,
  timezone            text,
  goals               text,
  created_date_time   timestamptz DEFAULT now(),
  updated_date_time   timestamptz DEFAULT now(),
  CONSTRAINT user_profile_pkey PRIMARY KEY (id)
);

ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON user_profile USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. app_user (FK → user_profile)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app_user (
  id                bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  utm_tracker       text,
  first_name        text,
  email             text,
  user_profile_id   bigint UNIQUE,
  created_date_time timestamptz DEFAULT now(),
  updated_date_time timestamptz DEFAULT now(),
  auth_user_id      uuid,
  CONSTRAINT app_user_pkey PRIMARY KEY (id),
  CONSTRAINT fk_app_user_user_profile FOREIGN KEY (user_profile_id) REFERENCES user_profile(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_email ON app_user (email);

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON app_user USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. report
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS report (
  id                bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  wizard_briefing   text,
  thumbnail         text,
  image             text,
  description       text,
  language          text,
  price             numeric,
  tax               numeric,
  status            text,
  created_date_time timestamptz DEFAULT now(),
  updated_date_time timestamptz DEFAULT now(),
  CONSTRAINT report_pkey PRIMARY KEY (id)
);

ALTER TABLE report ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON report USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. survey (FK → report)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS survey (
  id                     bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  report_id              bigint,
  wizard_briefing        text,
  title                  text,
  thumbnail              text,
  image                  text,
  description            text,
  language               text,
  estimated_duration_min integer,
  status                 text,
  created_date_time      timestamptz DEFAULT now(),
  updated_date_time      timestamptz DEFAULT now(),
  CONSTRAINT survey_pkey PRIMARY KEY (id),
  CONSTRAINT fk_survey_report FOREIGN KEY (report_id) REFERENCES report(id)
);

ALTER TABLE survey ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON survey USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. survey_question + frontend_qid column
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS survey_question (
  id                     bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  type                   text,
  question               text,
  subinfo                text,
  mythbuster             text,
  estimated_duration_min integer,
  display_order          integer,
  required               boolean,
  how_used               text,
  what_sim_user_shared   text,
  back_info              text,
  status                 text,
  frontend_qid           text UNIQUE,
  created_date_time      timestamptz DEFAULT now(),
  updated_date_time      timestamptz DEFAULT now(),
  CONSTRAINT survey_question_pkey PRIMARY KEY (id)
);

ALTER TABLE survey_question ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON survey_question USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. answer_option (FK → survey_question)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS answer_option (
  id                 bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  survey_question_id bigint NOT NULL,
  option_text        text,
  option_value       text,
  display_order      integer,
  created_date_time  timestamptz DEFAULT now(),
  updated_date_time  timestamptz DEFAULT now(),
  CONSTRAINT answer_option_pkey PRIMARY KEY (id),
  CONSTRAINT fk_answer_option_question FOREIGN KEY (survey_question_id) REFERENCES survey_question(id)
);

ALTER TABLE answer_option ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON answer_option USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. survey_question_mapping (FK → survey, survey_question)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS survey_question_mapping (
  survey_id         bigint NOT NULL,
  question_id       bigint NOT NULL,
  created_date_time timestamptz DEFAULT now(),
  CONSTRAINT survey_question_mapping_pkey PRIMARY KEY (survey_id, question_id),
  CONSTRAINT fk_sqm_survey FOREIGN KEY (survey_id) REFERENCES survey(id),
  CONSTRAINT fk_sqm_question FOREIGN KEY (question_id) REFERENCES survey_question(id)
);

ALTER TABLE survey_question_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON survey_question_mapping USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. survey_submission (FK → app_user, survey)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS survey_submission (
  id                bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id           bigint NOT NULL,
  survey_id         bigint NOT NULL,
  utm_tracker       text,
  regeneration_url  text,
  status            text,
  start_date_time   timestamptz,
  duration_ms       bigint,
  created_date_time timestamptz DEFAULT now(),
  CONSTRAINT survey_submission_pkey PRIMARY KEY (id),
  CONSTRAINT fk_survey_submission_user FOREIGN KEY (user_id) REFERENCES app_user(id),
  CONSTRAINT fk_survey_submission_survey FOREIGN KEY (survey_id) REFERENCES survey(id)
);

ALTER TABLE survey_submission ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON survey_submission USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. survey_submission_answer (FK → survey_submission, survey_question, answer_option)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS survey_submission_answer (
  id                   bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  survey_submission_id bigint NOT NULL,
  survey_question_id   bigint NOT NULL,
  answer_text          text,
  answer_option_id     bigint,
  normalized_value     numeric,
  answered_at          timestamptz,
  time_spent_seconds   integer,
  revision_count       integer,
  was_skipped          boolean,
  created_date_time    timestamptz DEFAULT now(),
  updated_date_time    timestamptz DEFAULT now(),
  CONSTRAINT survey_submission_answer_pkey PRIMARY KEY (id),
  CONSTRAINT fk_ssa_submission FOREIGN KEY (survey_submission_id) REFERENCES survey_submission(id),
  CONSTRAINT fk_ssa_question FOREIGN KEY (survey_question_id) REFERENCES survey_question(id),
  CONSTRAINT fk_ssa_answer_option FOREIGN KEY (answer_option_id) REFERENCES answer_option(id)
);

ALTER TABLE survey_submission_answer ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON survey_submission_answer USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. survey_submission_answer_options (FK → survey_submission_answer, answer_option)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS survey_submission_answer_options (
  id                          bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  survey_submission_answer_id bigint NOT NULL,
  answer_option_id            bigint NOT NULL,
  created_date_time           timestamptz DEFAULT now(),
  CONSTRAINT survey_submission_answer_options_pkey PRIMARY KEY (id),
  CONSTRAINT fk_ssao_ssa FOREIGN KEY (survey_submission_answer_id) REFERENCES survey_submission_answer(id),
  CONSTRAINT fk_ssao_answer_option FOREIGN KEY (answer_option_id) REFERENCES answer_option(id)
);

ALTER TABLE survey_submission_answer_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON survey_submission_answer_options USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. survey_submission_answer_history (FK → survey_submission_answer)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS survey_submission_answer_history (
  id                          bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  survey_submission_answer_id bigint NOT NULL,
  old_answer_text             text,
  old_answer_option_id        bigint,
  new_answer_text             text,
  new_answer_option_id        bigint,
  changed_at                  timestamptz,
  created_date_time           timestamptz DEFAULT now(),
  CONSTRAINT survey_submission_answer_history_pkey PRIMARY KEY (id),
  CONSTRAINT fk_ssah_ssa FOREIGN KEY (survey_submission_answer_id) REFERENCES survey_submission_answer(id)
);

ALTER TABLE survey_submission_answer_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON survey_submission_answer_history USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. report_section (FK → report)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS report_section (
  id                bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  report_id         bigint NOT NULL,
  display_order     integer,
  type              text,
  title             text,
  language          text,
  status            text,
  visibility        text,
  price             numeric,
  tax               numeric,
  created_date_time timestamptz DEFAULT now(),
  updated_date_time timestamptz DEFAULT now(),
  CONSTRAINT report_section_pkey PRIMARY KEY (id),
  CONSTRAINT fk_report_section_report FOREIGN KEY (report_id) REFERENCES report(id)
);

ALTER TABLE report_section ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON report_section USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. personal_report (FK → report, survey_submission) — NO payment FK yet
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS personal_report (
  id                    bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  report_id             bigint NOT NULL,
  survey_submission_id  bigint NOT NULL UNIQUE,
  url                   text,
  language              text,
  status                text,
  payment_status        text,
  payment_id            bigint,
  price                 numeric,
  tax                   numeric,
  created_date_time     timestamptz DEFAULT now(),
  updated_date_time     timestamptz DEFAULT now(),
  CONSTRAINT personal_report_pkey PRIMARY KEY (id),
  CONSTRAINT fk_personal_report_report FOREIGN KEY (report_id) REFERENCES report(id),
  CONSTRAINT fk_personal_report_submission FOREIGN KEY (survey_submission_id) REFERENCES survey_submission(id)
  -- payment FK added after payment table is created (circular dependency)
);

ALTER TABLE personal_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON personal_report USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. payment (FK → app_user, personal_report)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment (
  id                        bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id                   bigint NOT NULL,
  personal_report_id        bigint,
  stripe_payment_intent_id  text,
  stripe_charge_id          text,
  stripe_customer_id        text,
  stripe_payment_method_id  text,
  amount                    numeric,
  currency                  text,
  status                    text CHECK (status IS NULL OR status = ANY (ARRAY[
    'requires_payment_method', 'requires_action', 'processing',
    'succeeded', 'canceled', 'failed', 'refunded'
  ])),
  payment_method_type       text,
  card_brand                text,
  card_last4                text,
  card_exp_month            integer,
  card_exp_year             integer,
  description               text,
  receipt_url               text,
  refund_amount             numeric,
  refund_reason             text,
  refunded_at               timestamptz,
  metadata                  jsonb,
  failure_code              text,
  failure_message           text,
  ip_address                text,
  user_agent                text,
  payment_date_time         timestamptz,
  created_date_time         timestamptz DEFAULT now(),
  updated_date_time         timestamptz DEFAULT now(),
  CONSTRAINT payment_pkey PRIMARY KEY (id),
  CONSTRAINT fk_payment_user FOREIGN KEY (user_id) REFERENCES app_user(id),
  CONSTRAINT fk_payment_personal_report FOREIGN KEY (personal_report_id) REFERENCES personal_report(id)
);

ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON payment USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. Resolve circular dependency: personal_report → payment
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE personal_report
  ADD CONSTRAINT fk_personal_report_payment
  FOREIGN KEY (payment_id) REFERENCES payment(id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 16. payment_item (FK → payment)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_item (
  id                bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  payment_id        bigint NOT NULL,
  item_type         text,
  item_id           bigint,
  item_name         text,
  quantity          integer,
  unit_price        numeric,
  total_price       numeric,
  created_date_time timestamptz DEFAULT now(),
  CONSTRAINT payment_item_pkey PRIMARY KEY (id),
  CONSTRAINT fk_payment_item_payment FOREIGN KEY (payment_id) REFERENCES payment(id)
);

ALTER TABLE payment_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON payment_item USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 17. payment_webhook_event (FK → payment)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_webhook_event (
  id                        bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  stripe_event_id           text,
  event_type                text,
  payment_id                bigint,
  stripe_payment_intent_id  text,
  event_data                jsonb,
  processed                 boolean,
  processed_at              timestamptz,
  processing_error          text,
  received_at               timestamptz,
  created_date_time         timestamptz DEFAULT now(),
  CONSTRAINT payment_webhook_event_pkey PRIMARY KEY (id),
  CONSTRAINT fk_webhook_payment FOREIGN KEY (payment_id) REFERENCES payment(id)
);

ALTER TABLE payment_webhook_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON payment_webhook_event USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 18. personal_report_section (FK → report_section, personal_report, payment)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS personal_report_section (
  id                  bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  report_section_id   bigint NOT NULL,
  personal_report_id  bigint NOT NULL,
  content             text,
  language            text,
  payment_status      text,
  payment_id          bigint,
  price               numeric,
  tax                 numeric,
  created_date_time   timestamptz DEFAULT now(),
  updated_date_time   timestamptz DEFAULT now(),
  CONSTRAINT personal_report_section_pkey PRIMARY KEY (id),
  CONSTRAINT fk_prs_report_section FOREIGN KEY (report_section_id) REFERENCES report_section(id),
  CONSTRAINT fk_prs_personal_report FOREIGN KEY (personal_report_id) REFERENCES personal_report(id),
  CONSTRAINT fk_personal_report_section_payment FOREIGN KEY (payment_id) REFERENCES payment(id)
);

ALTER TABLE personal_report_section ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON personal_report_section USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 19. report_section_rating (FK → personal_report_section)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS report_section_rating (
  id                          bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  personal_report_section_id  bigint NOT NULL,
  rating                      text,
  comment                     text,
  created_date_time           timestamptz DEFAULT now(),
  CONSTRAINT report_section_rating_pkey PRIMARY KEY (id),
  CONSTRAINT fk_rating_prs FOREIGN KEY (personal_report_section_id) REFERENCES personal_report_section(id)
);

ALTER TABLE report_section_rating ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON report_section_rating USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 20. report_access_email (FK → personal_report)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS report_access_email (
  id                  bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  personal_report_id  bigint NOT NULL,
  email               text,
  status              text,
  created_date_time   timestamptz DEFAULT now(),
  CONSTRAINT report_access_email_pkey PRIMARY KEY (id),
  CONSTRAINT fk_rae_personal_report FOREIGN KEY (personal_report_id) REFERENCES personal_report(id)
);

ALTER TABLE report_access_email ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON report_access_email USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 21. report_access_token (FK → report_access_email)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS report_access_token (
  id                      bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  report_access_email_id  bigint NOT NULL,
  email                   text,
  magic_url               text,
  expire_date_time        timestamptz,
  status                  text,
  created_date_time       timestamptz DEFAULT now(),
  CONSTRAINT report_access_token_pkey PRIMARY KEY (id),
  CONSTRAINT fk_rat_rae FOREIGN KEY (report_access_email_id) REFERENCES report_access_email(id)
);

ALTER TABLE report_access_token ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON report_access_token USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 22. report_session (FK → personal_report, app_user)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS report_session (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  personal_report_id  bigint NOT NULL,
  user_id             bigint,
  started_at          timestamptz NOT NULL DEFAULT now(),
  ended_at            timestamptz,
  utm_tracker         text,
  user_agent          text,
  ip_address          text,
  CONSTRAINT report_session_pkey PRIMARY KEY (id),
  CONSTRAINT report_session_personal_report_id_fkey FOREIGN KEY (personal_report_id) REFERENCES personal_report(id),
  CONSTRAINT report_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_user(id)
);

ALTER TABLE report_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON report_session USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 23. report_section_kpi (FK → report, report_section)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS report_section_kpi (
  id                          bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  report_id                   bigint NOT NULL,
  report_section_id           bigint NOT NULL,
  language                    text,
  date                        date,
  reach_n                     integer,
  dropoff_n                   integer,
  backtrack_n                 integer,
  guidance_tooltip_open_n     integer,
  error_n                     integer,
  cta_unlock_n                integer,
  scroll_complete_n           integer,
  skip_n                      integer,
  avg_active_time_s           numeric,
  created_date_time           timestamptz DEFAULT now(),
  CONSTRAINT report_section_kpi_pkey PRIMARY KEY (id),
  CONSTRAINT report_section_kpi_report_fk FOREIGN KEY (report_id) REFERENCES report(id),
  CONSTRAINT report_section_kpi_section_fk FOREIGN KEY (report_section_id) REFERENCES report_section(id)
);

ALTER TABLE report_section_kpi ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON report_section_kpi USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 24. survey_question_kpi (FK → survey_question, survey)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS survey_question_kpi (
  id                          bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  survey_id                   bigint NOT NULL,
  survey_question_id          bigint NOT NULL,
  date                        date NOT NULL,
  language                    text,
  reach_n                     integer,
  dropoff_n                   integer,
  backtrack_n                 integer,
  guidance_tooltip_open_n     integer,
  error_n                     integer,
  avg_active_time_s           numeric,
  created_date_time           timestamptz DEFAULT now(),
  CONSTRAINT survey_question_kpi_pkey PRIMARY KEY (id),
  CONSTRAINT survey_question_kpi_question_fk FOREIGN KEY (survey_question_id) REFERENCES survey_question(id),
  CONSTRAINT survey_question_kpi_survey_fk FOREIGN KEY (survey_id) REFERENCES survey(id)
);

ALTER TABLE survey_question_kpi ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON survey_question_kpi USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 25. analytics_event (FK → report_session, app_user, personal_report, survey_submission)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS analytics_event (
  id                    bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  event_time            timestamptz NOT NULL DEFAULT now(),
  event_type            text NOT NULL,
  session_id            uuid,
  user_id               bigint,
  entity_type           text NOT NULL,
  entity_id             bigint NOT NULL,
  personal_report_id    bigint,
  survey_submission_id  bigint,
  duration_ms           integer,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT analytics_event_pkey PRIMARY KEY (id),
  CONSTRAINT analytics_event_session_id_fkey FOREIGN KEY (session_id) REFERENCES report_session(id),
  CONSTRAINT analytics_event_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_user(id),
  CONSTRAINT analytics_event_personal_report_id_fkey FOREIGN KEY (personal_report_id) REFERENCES personal_report(id),
  CONSTRAINT analytics_event_survey_submission_id_fkey FOREIGN KEY (survey_submission_id) REFERENCES survey_submission(id)
);

ALTER TABLE analytics_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON analytics_event USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 26. user_interactions (FK → app_user)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_interactions (
  id                  bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id             bigint NOT NULL,
  type                text,
  created_date_time   timestamptz DEFAULT now(),
  report_id           bigint,
  report_section_id   bigint,
  report_session_id   uuid,
  section_order       integer,
  active_time_s       numeric,
  CONSTRAINT user_interactions_pkey PRIMARY KEY (id),
  CONSTRAINT fk_user_interactions_user FOREIGN KEY (user_id) REFERENCES app_user(id)
);

ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON user_interactions USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 27. waitlist_user
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS waitlist_user (
  id                bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  email             text,
  utm_tracker       text,
  unsub_status      boolean DEFAULT false,
  created_date_time timestamptz DEFAULT now(),
  CONSTRAINT waitlist_user_pkey PRIMARY KEY (id)
);

ALTER TABLE waitlist_user ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON waitlist_user USING (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 28. waitlist_mapping (FK → waitlist_user, app_user)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS waitlist_mapping (
  waitlist_id       bigint NOT NULL,
  user_id           bigint NOT NULL,
  created_date_time timestamptz DEFAULT now(),
  CONSTRAINT waitlist_mapping_pkey PRIMARY KEY (waitlist_id, user_id),
  CONSTRAINT fk_waitlist_mapping_waitlist FOREIGN KEY (waitlist_id) REFERENCES waitlist_user(id),
  CONSTRAINT fk_waitlist_mapping_user FOREIGN KEY (user_id) REFERENCES app_user(id)
);

ALTER TABLE waitlist_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON waitlist_mapping USING (false);

COMMIT;

-- Marketing opt-in capture for survey Q16015.
--
-- Q16015 ("Would you like to receive free LoveIQ hints and insights?") has
-- Yes/No options. Until now the answer was buried inside the JSONB answers
-- payload and nothing read it. This migration captures it as a first-class
-- boolean + timestamp on survey_submission so consent is GDPR-auditable and
-- the cohort is indexable for future marketing list exports.
--
-- Companion code in app/api/survey/route.ts extracts the answer and pushes
-- "Yes" emails into a Resend Audience (RESEND_AUDIENCE_ID) for future
-- campaigns. "No" answers are NOT added to email_suppression — nurture
-- emails about the user's own report are treated as service-tier email and
-- continue to honour the standard unsubscribe link.

-- 1. Columns. Default NULL so historical rows aren't retroactively counted.
ALTER TABLE survey_submission
  ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMPTZ;

-- Partial index for fast marketing list exports / cohort queries.
CREATE INDEX IF NOT EXISTS idx_survey_submission_marketing_opt_in
  ON survey_submission (marketing_opt_in)
  WHERE marketing_opt_in IS TRUE;

-- 2. Drop the existing 7-arg signature so the next CREATE replaces cleanly.
DROP FUNCTION IF EXISTS submit_survey(TEXT, TEXT, JSONB, TIMESTAMPTZ, BIGINT, TEXT, UUID);

-- 3. Recreate with p_marketing_opt_in (8th arg, optional for back-compat).
--    Body copied verbatim from supabase/migrations/20260318123740_fix_data_collection_part2_schema_and_rpc.sql
--    The only change is the INSERT INTO survey_submission, which now
--    populates marketing_opt_in and marketing_opt_in_at.
CREATE OR REPLACE FUNCTION submit_survey(
  p_email             TEXT,
  p_first_name        TEXT,
  p_answers           JSONB,
  p_started_at        TIMESTAMPTZ,
  p_duration_ms       BIGINT,
  p_utm_tracker       TEXT    DEFAULT NULL,
  p_session_id        UUID    DEFAULT NULL,
  p_marketing_opt_in  BOOLEAN DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         BIGINT;
  v_profile_id      BIGINT;
  v_survey_id       BIGINT;
  v_submission_id   BIGINT;
  v_key             TEXT;
  v_value           JSONB;
  v_question_id     BIGINT;
  v_question_type   TEXT;
  v_answer_id       BIGINT;
  v_option_id       BIGINT;
  v_option_text     TEXT;
  v_other_text      TEXT;
  v_elem            JSONB;
  v_gender          TEXT;
  v_orientation     TEXT;
  v_rel_status      TEXT;
  v_country         TEXT;
BEGIN
  -- 1a. Upsert app_user by email
  INSERT INTO app_user (email, first_name, utm_tracker)
  VALUES (p_email, p_first_name, p_utm_tracker)
  ON CONFLICT (email) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        utm_tracker = COALESCE(app_user.utm_tracker, EXCLUDED.utm_tracker),
        updated_date_time = now()
  RETURNING id INTO v_user_id;

  -- 1b. Auto-link waitlist signup if email matches
  INSERT INTO waitlist_mapping (waitlist_id, user_id)
  SELECT wu.id, v_user_id
  FROM waitlist_user wu
  WHERE lower(wu.email) = lower(p_email)
  ON CONFLICT DO NOTHING;

  -- 2. Get the active survey
  SELECT id INTO v_survey_id
  FROM survey
  WHERE status = 'active'
  ORDER BY id
  LIMIT 1;

  IF v_survey_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No active survey found');
  END IF;

  -- 3. Create survey_submission (now stores marketing_opt_in + timestamp)
  INSERT INTO survey_submission (
    user_id, survey_id, status, start_date_time, duration_ms,
    utm_tracker, session_id, marketing_opt_in, marketing_opt_in_at
  )
  VALUES (
    v_user_id, v_survey_id, 'completed', p_started_at, p_duration_ms,
    p_utm_tracker, p_session_id, p_marketing_opt_in,
    CASE WHEN p_marketing_opt_in IS TRUE THEN now() ELSE NULL END
  )
  RETURNING id INTO v_submission_id;

  -- 4. Loop through answer keys
  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_answers)
  LOOP
    IF v_key LIKE '%\_other' THEN
      CONTINUE;
    END IF;

    SELECT sq.id, sq.type
    INTO v_question_id, v_question_type
    FROM survey_question sq
    WHERE sq.frontend_qid = v_key;

    IF v_question_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Extract demographics from answers for user_profile
    CASE v_key
      WHEN '15001' THEN v_country     := v_value #>> '{}';
      WHEN '15010' THEN v_gender      := v_value #>> '{}';
      WHEN '15011' THEN v_orientation := v_value #>> '{}';
      WHEN '15004' THEN v_rel_status  := v_value #>> '{}';
      ELSE NULL;
    END CASE;

    -- Check for companion _other text
    v_other_text := NULL;
    IF p_answers ? (v_key || '_other') THEN
      v_other_text := p_answers ->> (v_key || '_other');
    END IF;

    -- Handle by question type
    CASE v_question_type
      WHEN 'open' THEN
        INSERT INTO survey_submission_answer
          (survey_submission_id, survey_question_id, answer_text, answered_at)
        VALUES
          (v_submission_id, v_question_id, v_value #>> '{}', now());

      WHEN 'scale' THEN
        INSERT INTO survey_submission_answer
          (survey_submission_id, survey_question_id, normalized_value, answered_at)
        VALUES
          (v_submission_id, v_question_id, (v_value #>> '{}')::numeric, now());

      WHEN 'single' THEN
        v_option_id := NULL;
        SELECT ao.id INTO v_option_id
        FROM answer_option ao
        WHERE ao.survey_question_id = v_question_id
          AND ao.option_text = v_value #>> '{}';

        INSERT INTO survey_submission_answer
          (survey_submission_id, survey_question_id, answer_option_id, answer_text, answered_at)
        VALUES
          (v_submission_id, v_question_id, v_option_id,
           COALESCE(v_other_text, CASE WHEN v_option_id IS NULL THEN v_value #>> '{}' ELSE NULL END),
           now());

      WHEN 'multiple' THEN
        INSERT INTO survey_submission_answer
          (survey_submission_id, survey_question_id, answer_text, answered_at)
        VALUES
          (v_submission_id, v_question_id, v_other_text, now())
        RETURNING id INTO v_answer_id;

        FOR v_elem IN SELECT * FROM jsonb_array_elements(v_value)
        LOOP
          v_option_text := v_elem #>> '{}';
          v_option_id := NULL;

          SELECT ao.id INTO v_option_id
          FROM answer_option ao
          WHERE ao.survey_question_id = v_question_id
            AND ao.option_text = v_option_text;

          IF v_option_id IS NOT NULL THEN
            INSERT INTO survey_submission_answer_options
              (survey_submission_answer_id, answer_option_id)
            VALUES
              (v_answer_id, v_option_id);
          END IF;
        END LOOP;

      ELSE
        INSERT INTO survey_submission_answer
          (survey_submission_id, survey_question_id, answer_text, answered_at)
        VALUES
          (v_submission_id, v_question_id, v_value::text, now());
    END CASE;
  END LOOP;

  -- 5. Create / update user_profile from demographics
  IF v_gender IS NOT NULL OR v_orientation IS NOT NULL
     OR v_rel_status IS NOT NULL OR v_country IS NOT NULL THEN

    SELECT user_profile_id INTO v_profile_id
    FROM app_user WHERE id = v_user_id;

    IF v_profile_id IS NOT NULL THEN
      UPDATE user_profile
      SET gender             = COALESCE(v_gender, gender),
          sexual_orientation = COALESCE(v_orientation, sexual_orientation),
          relationship_status = COALESCE(v_rel_status, relationship_status),
          location_primary   = COALESCE(v_country, location_primary),
          updated_date_time  = now()
      WHERE id = v_profile_id;
    ELSE
      INSERT INTO user_profile (gender, sexual_orientation, relationship_status, location_primary)
      VALUES (v_gender, v_orientation, v_rel_status, v_country)
      RETURNING id INTO v_profile_id;

      UPDATE app_user
      SET user_profile_id = v_profile_id,
          updated_date_time = now()
      WHERE id = v_user_id;
    END IF;
  END IF;

  -- 6. Backfill per-answer metadata from behavior events (if session provided)
  IF p_session_id IS NOT NULL THEN
    UPDATE survey_submission_answer ssa
    SET time_spent_seconds = beh.total_time_s,
        answered_at        = beh.last_answered_at,
        was_skipped        = NOT beh.was_answered,
        revision_count     = GREATEST(beh.answer_count - 1, 0)
    FROM (
      SELECT
        sbe.q_id,
        ROUND(SUM(sbe.time_spent_ms) / 1000.0)::int AS total_time_s,
        MAX(CASE WHEN sbe.answered THEN sbe.event_time END) AS last_answered_at,
        BOOL_OR(sbe.answered) AS was_answered,
        COUNT(*) FILTER (WHERE sbe.answered AND sbe.direction IN ('forward', 'complete')) AS answer_count
      FROM survey_behavior_event sbe
      WHERE sbe.session_id = p_session_id
      GROUP BY sbe.q_id
    ) beh
    JOIN survey_question sq ON sq.frontend_qid = beh.q_id
    WHERE ssa.survey_submission_id = v_submission_id
      AND ssa.survey_question_id = sq.id;
  END IF;

  -- 7. Return success
  RETURN json_build_object(
    'success', true,
    'submission_id', v_submission_id,
    'user_id', v_user_id
  );
END;
$$;

-- Grant + lock down the new signature, matching the previous lockdown migrations
-- (supabase/migrations/20260430140000_lock_security_definer_rpcs.sql,
--  supabase/migrations/20260501000000_lock_security_definer_rpcs_public.sql).
GRANT EXECUTE ON FUNCTION submit_survey(TEXT, TEXT, JSONB, TIMESTAMPTZ, BIGINT, TEXT, UUID, BOOLEAN)
  TO service_role;

REVOKE EXECUTE ON FUNCTION submit_survey(
  TEXT, TEXT, JSONB, TIMESTAMPTZ, BIGINT, TEXT, UUID, BOOLEAN
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION submit_survey(
  TEXT, TEXT, JSONB, TIMESTAMPTZ, BIGINT, TEXT, UUID, BOOLEAN
) FROM PUBLIC;

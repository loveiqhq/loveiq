
-- PART 2: Add session_id column to survey_submission
ALTER TABLE survey_submission
  ADD COLUMN IF NOT EXISTS session_id UUID;

CREATE INDEX IF NOT EXISTS idx_submission_session_id
  ON survey_submission (session_id)
  WHERE session_id IS NOT NULL;

-- PART 3: Updated RPC — session_id, utm on app_user, user_profile
DROP FUNCTION IF EXISTS submit_survey(TEXT, TEXT, JSONB, TIMESTAMPTZ, BIGINT, TEXT);

CREATE OR REPLACE FUNCTION submit_survey(
  p_email         TEXT,
  p_first_name    TEXT,
  p_answers       JSONB,
  p_started_at    TIMESTAMPTZ,
  p_duration_ms   BIGINT,
  p_utm_tracker   TEXT    DEFAULT NULL,
  p_session_id    UUID    DEFAULT NULL
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
  -- 1a. Upsert app_user by email (now includes utm_tracker on first insert)
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

  -- 3. Create survey_submission (includes utm_tracker + session_id)
  INSERT INTO survey_submission (user_id, survey_id, status, start_date_time, duration_ms, utm_tracker, session_id)
  VALUES (v_user_id, v_survey_id, 'completed', p_started_at, p_duration_ms, p_utm_tracker, p_session_id)
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
      WHEN '15011' THEN v_orientation  := v_value #>> '{}';
      WHEN '15004' THEN v_rel_status   := v_value #>> '{}';
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

-- Grant execute to service_role (new signature)
GRANT EXECUTE ON FUNCTION submit_survey(TEXT, TEXT, JSONB, TIMESTAMPTZ, BIGINT, TEXT, UUID)
  TO service_role;
;

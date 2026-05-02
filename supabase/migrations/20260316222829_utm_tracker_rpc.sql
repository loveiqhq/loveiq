-- Drop old function signature
DROP FUNCTION IF EXISTS submit_survey(TEXT, TEXT, JSONB, TIMESTAMPTZ, BIGINT);

CREATE OR REPLACE FUNCTION submit_survey(
  p_email         TEXT,
  p_first_name    TEXT,
  p_answers       JSONB,
  p_started_at    TIMESTAMPTZ,
  p_duration_ms   BIGINT,
  p_utm_tracker   TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       BIGINT;
  v_survey_id     BIGINT;
  v_submission_id BIGINT;
  v_key           TEXT;
  v_value         JSONB;
  v_question_id   BIGINT;
  v_question_type TEXT;
  v_answer_id     BIGINT;
  v_option_id     BIGINT;
  v_option_text   TEXT;
  v_other_text    TEXT;
  v_elem          JSONB;
BEGIN
  -- 1a. Upsert app_user by email
  INSERT INTO app_user (email, first_name)
  VALUES (p_email, p_first_name)
  ON CONFLICT (email) DO UPDATE
    SET first_name = EXCLUDED.first_name,
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

  -- 3. Create survey_submission (now includes utm_tracker)
  INSERT INTO survey_submission (user_id, survey_id, status, start_date_time, duration_ms, utm_tracker)
  VALUES (v_user_id, v_survey_id, 'completed', p_started_at, p_duration_ms, p_utm_tracker)
  RETURNING id INTO v_submission_id;

  -- 4. Loop through answer keys
  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_answers)
  LOOP
    -- Skip _other companion keys (handled inline with their parent)
    IF v_key LIKE '%\_other' THEN
      CONTINUE;
    END IF;

    -- Look up question by frontend_qid
    SELECT sq.id, sq.type
    INTO v_question_id, v_question_type
    FROM survey_question sq
    WHERE sq.frontend_qid = v_key;

    IF v_question_id IS NULL THEN
      -- Unknown question key — skip gracefully
      CONTINUE;
    END IF;

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

  -- 5. Return success
  RETURN json_build_object(
    'success', true,
    'submission_id', v_submission_id,
    'user_id', v_user_id
  );
END;
$$;

-- Grant execute to service_role (new signature includes TEXT for utm)
GRANT EXECUTE ON FUNCTION submit_survey(TEXT, TEXT, JSONB, TIMESTAMPTZ, BIGINT, TEXT)
  TO service_role;;

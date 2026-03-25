-- Update Q00001: "What is your first name?" -> "What is your name?"
UPDATE survey_question
SET question = 'What is your name?',
    updated_date_time = now()
WHERE frontend_qid = '00001';

-- Note: Q03014 scale label "Almost always" -> "Always" is a frontend-only change.
-- Scale questions store numeric values (1-7) in the database, not label text.
-- The answer_option table has no rows for scale questions.

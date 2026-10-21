-- Rollback for 20261021200000_relink_single_answers: unlinks exactly the rows it linked. Those are
-- the linked single answers whose text is their option's own wording, from surveys finished
-- before 15 Jun 2026; no such row existed before it ran (checked 21 Oct 2026), and submit_survey
-- has written a linked single answer without its text since.

UPDATE survey_submission_answer a
   SET answer_option_id = NULL
  FROM survey_question q, answer_option o, survey_submission s
 WHERE a.survey_question_id = q.id
   AND q.type = 'single'
   AND a.answer_option_id = o.id
   AND a.answer_text = o.option_text
   AND s.id = a.survey_submission_id
   AND s.created_date_time < '2026-06-15 00:00:00+00';

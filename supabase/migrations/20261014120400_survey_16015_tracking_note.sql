-- The marketing opt-in question (16015) now says we see whether our emails are opened and which
-- links are clicked (consent text version 2026-10-14, data/survey-source.csv). The survey shows
-- the text from the repo; this keeps the database's copy (survey_question.subinfo, read by no
-- page) the same. Rollback: supabase/rollbacks/20261014120400_survey_16015_tracking_note_down.sql.

UPDATE public.survey_question
   SET subinfo = 'This includes insights on sexuality, intimacy, research papers, news and future advanced tests. We see whether our emails are opened and which links are clicked, to make them better.',
       updated_date_time = now()
 WHERE frontend_qid = '16015'
   AND subinfo IS DISTINCT FROM 'This includes insights on sexuality, intimacy, research papers, news and future advanced tests. We see whether our emails are opened and which links are clicked, to make them better.';

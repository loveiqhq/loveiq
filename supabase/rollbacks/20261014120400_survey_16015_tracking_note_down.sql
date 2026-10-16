-- Rollback for 20261014120400_survey_16015_tracking_note: the database's copy of question
-- 16015's guide line as it was before (14 Jun 2026).

UPDATE public.survey_question
   SET subinfo = 'This includes insights on sexuality, intimacy, research papers, news and future advanced tests.',
       updated_date_time = now()
 WHERE frontend_qid = '16015';

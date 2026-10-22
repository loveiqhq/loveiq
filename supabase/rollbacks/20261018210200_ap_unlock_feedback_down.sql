-- Rollback of 20261018210200_ap_unlock_feedback.sql: the Unlock feedback page's reader. Nothing
-- else calls it; the page answers with an error until the function is back.
DROP FUNCTION IF EXISTS public.ap_unlock_feedback(date, date);

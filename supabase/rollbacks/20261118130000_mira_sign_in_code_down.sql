-- Rollback of 20261118130000_mira_sign_in_code.sql. Roll the code back first: without the
-- table and function, Mira's verify refuses every code (it fails closed).

DROP FUNCTION IF EXISTS public.mira_claim_code_attempt(text, integer, integer);
DROP TABLE IF EXISTS public.mira_sign_in_code;

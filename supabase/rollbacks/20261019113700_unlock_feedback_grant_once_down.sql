-- Rollback of 20261019113700_unlock_feedback_grant_once.sql. Grants stay; only the guard against
-- a second one per report goes.
DROP INDEX CONCURRENTLY IF EXISTS public.payment_unlock_feedback_once;

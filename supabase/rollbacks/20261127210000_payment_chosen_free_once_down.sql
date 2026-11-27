-- Rollback of 20261127210000_payment_chosen_free_once.sql. The EUR 0 choices stay; only the guard
-- against a second one per report goes.
DROP INDEX CONCURRENTLY IF EXISTS public.payment_chosen_free_once;

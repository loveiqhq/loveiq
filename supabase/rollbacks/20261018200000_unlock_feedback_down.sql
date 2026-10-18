-- Rollback of 20261018200000_unlock_feedback.sql. Drops every answer: export the table first.
DROP TABLE IF EXISTS public.unlock_feedback;

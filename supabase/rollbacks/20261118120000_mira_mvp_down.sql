-- Rollback of 20261118120000_mira_mvp.sql: Mira's accounts, chats, messages and KPI log.
-- Dropping them loses every Mira profile, stored chat and event. Roll the code back first:
-- without the tables every Mira write is refused and logged as "write REJECTED".
-- The Supabase Auth users created by Mira sign-ups stay; delete them in the dashboard if needed.

DROP TABLE IF EXISTS public.mira_event;
DROP TABLE IF EXISTS public.mira_message;
DROP TABLE IF EXISTS public.mira_chat;
DROP TABLE IF EXISTS public.mira_user;

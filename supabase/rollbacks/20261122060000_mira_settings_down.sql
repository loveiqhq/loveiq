-- Rollback of 20261122060000_mira_settings.sql: mira_user.reply_language, theme and text_size go.
-- Roll the code back first: Settings, the chat (the reply language) and AP › Mira read them.
-- What people chose is lost; each browser keeps its own look (the mira_look cookie).
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261122060000_mira_settings_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_user
  DROP COLUMN IF EXISTS reply_language,
  DROP COLUMN IF EXISTS theme,
  DROP COLUMN IF EXISTS text_size;

COMMIT;

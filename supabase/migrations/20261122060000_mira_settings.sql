-- Mira's Settings upgrade (21 Nov 2026): the language Mira replies in, and how Mira looks.
-- Additive only. Follows 20261121030000.
-- Rollback: supabase/rollbacks/20261122060000_mira_settings_down.sql
--
-- mira_user.reply_language: "Mira replies in" (Settings). Null is the default, "Match my
--   messages": she answers in the language the person writes in. Otherwise one of the languages
--   whose crisis words Mira reads before the model (features/mira/reply-languages.ts); adding one
--   means adding its crisis patterns first (server/safety.ts), then this list.
-- mira_user.theme, mira_user.text_size: Settings › Appearance (Light, Dark or System; Small,
--   Default or Large). Null where never chosen: the browser keeps its own (the mira_look cookie).
--   A new sign-in brings the saved ones to that browser.
-- An under-18 stop clears all three (server/minor.ts).
--
-- Apply before the code that reads them (features/mira/server/store.ts PROFILE_COLS, and
-- AP › Mira) is deployed. Service role only, like every other Mira object.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_user
  ADD COLUMN IF NOT EXISTS reply_language text
    CHECK (reply_language IN ('en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'tr', 'ru', 'ar', 'bs', 'hr', 'sr')),
  ADD COLUMN IF NOT EXISTS theme text CHECK (theme IN ('light', 'dark', 'system')),
  ADD COLUMN IF NOT EXISTS text_size text CHECK (text_size IN ('small', 'default', 'large'));

COMMENT ON COLUMN public.mira_user.reply_language IS
  'Settings › "Mira replies in": a language code from features/mira/reply-languages.ts, or null to match the person''s messages.';
COMMENT ON COLUMN public.mira_user.theme IS
  'Settings › Appearance: light, dark or system; null where never chosen (the browser keeps its own).';
COMMENT ON COLUMN public.mira_user.text_size IS
  'Settings › Text size: small, default or large; null where never chosen (the browser keeps its own).';

COMMIT;

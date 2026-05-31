-- DOWN migration for 20260525120300_report_access_token_expires_at.sql.
--
-- Drops report_access_token.expires_at (pure column; no index was added).
--
-- WARNING: any time-bounded tokens an operator minted (expires_at set) become
-- permanent again once this runs. Permanent tokens (expires_at IS NULL) are
-- unaffected. Redeploy the app too so the reader stops honoring `expires_at`.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260525120300_report_access_token_expires_at_down.sql

BEGIN;

ALTER TABLE public.report_access_token
  DROP COLUMN IF EXISTS expires_at;

COMMIT;

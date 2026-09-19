-- ═══════════════════════════════════════════════════════════════════════════
-- report_access_token revocation column
-- ═══════════════════════════════════════════════════════════════════════════
-- Tokens stay permanent by product design (don't auto-expire bookmarked
-- URLs), but ops needs an incident-response path for leaked tokens. Add a
-- nullable revoked_at column + partial index for the active-token lookup
-- pattern; every code site that resolves a token now filters
-- `revoked_at=is.null`.

ALTER TABLE public.report_access_token
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- Partial index — only non-revoked rows. Stays small even after years of
-- accumulation, and matches the WHERE clause used by every read site.
CREATE INDEX IF NOT EXISTS idx_report_access_token_active_token
  ON public.report_access_token (token)
  WHERE revoked_at IS NULL;

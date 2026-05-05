-- ═══════════════════════════════════════════════════════════════════════════
-- marketing_spend
--
-- Manual-entry table for marketing inputs (ad spend, channel mix, traffic)
-- that are not tracked elsewhere in Supabase. Powers the Marketing Input,
-- Traffic, Unit Economics, and Efficiency & Scale layers of the
-- Core_KPI dashboard at /admin/analytics.
--
-- Admins enter daily values per channel (Meta, Google, TikTok, Direct, etc.)
-- via the Marketing Inputs editor. Derived KPIs (CPC, CPPR, ROAS) compute on
-- read in the /api/admin/analytics/core-kpis aggregator.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing_spend (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date              date NOT NULL,
  channel           text NOT NULL,
  spend_eur         numeric NOT NULL DEFAULT 0 CHECK (spend_eur >= 0),
  clicks            integer NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  impressions       integer NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  unique_visitors   integer NOT NULL DEFAULT 0 CHECK (unique_visitors >= 0),
  notes             text,
  created_by_email  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_spend_date_channel_unique UNIQUE (date, channel)
);

CREATE INDEX IF NOT EXISTS idx_marketing_spend_date ON marketing_spend (date DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_spend_channel ON marketing_spend (channel);

ALTER TABLE marketing_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON marketing_spend USING (false);

-- updated_at auto-bump trigger.
-- search_path is locked to silence the function_search_path_mutable advisor.
CREATE OR REPLACE FUNCTION marketing_spend_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketing_spend_set_updated_at ON marketing_spend;
CREATE TRIGGER marketing_spend_set_updated_at
  BEFORE UPDATE ON marketing_spend
  FOR EACH ROW
  EXECUTE FUNCTION marketing_spend_set_updated_at();

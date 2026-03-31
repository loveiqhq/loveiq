CREATE TABLE IF NOT EXISTS public.admin_dashboard_subscription (
  id BIGSERIAL PRIMARY KEY,
  admin_email TEXT NOT NULL,
  dashboard_key TEXT NOT NULL,
  dashboard_label TEXT NOT NULL,
  audience_role TEXT NOT NULL
    CHECK (audience_role IN ('leadership', 'strategy', 'product', 'growth', 'tech', 'ops', 'research')),
  cadence TEXT NOT NULL
    CHECK (cadence IN ('daily', 'weekly', 'monthly')),
  subscriber_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_metric_key TEXT NULL,
  note TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_dashboard_subscription_unique UNIQUE (dashboard_key, audience_role, cadence),
  CONSTRAINT admin_dashboard_subscription_subscriber_array
    CHECK (jsonb_typeof(subscriber_emails) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_admin_dashboard_subscription_active
  ON public.admin_dashboard_subscription (is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_dashboard_subscription_audience
  ON public.admin_dashboard_subscription (audience_role, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_dashboard_subscription_dashboard
  ON public.admin_dashboard_subscription (dashboard_key, updated_at DESC);

ALTER TABLE public.admin_dashboard_subscription ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_dashboard_subscription;
CREATE POLICY service_role_only
ON public.admin_dashboard_subscription
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON TABLE public.admin_dashboard_subscription FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_dashboard_subscription TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S'
      AND c.relname = 'admin_dashboard_subscription_id_seq'
      AND n.nspname = 'public'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_dashboard_subscription_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_dashboard_subscription_id_seq TO service_role;
  END IF;
END $$;

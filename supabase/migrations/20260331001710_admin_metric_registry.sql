CREATE TABLE IF NOT EXISTS public.admin_metric_registry (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email text NOT NULL,
  metric_key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  owner_email text,
  stewardship_role text
    CHECK (
      stewardship_role IS NULL
      OR stewardship_role = ANY (
        ARRAY['strategy'::text, 'product'::text, 'growth'::text, 'tech'::text, 'ops'::text]
      )
    ),
  formula text,
  source_of_truth text,
  review_cadence_days integer NOT NULL DEFAULT 30
    CHECK (review_cadence_days >= 7 AND review_cadence_days <= 365),
  last_reviewed_at timestamptz,
  unit text NOT NULL DEFAULT 'count'
    CHECK (
      unit = ANY (
        ARRAY['percent'::text, 'minutes'::text, 'count'::text, 'currency'::text, 'score'::text]
      )
    ),
  linked_href text,
  trust_mode text NOT NULL DEFAULT 'derived'
    CHECK (
      trust_mode = ANY (
        ARRAY['live'::text, 'derived'::text, 'sampled'::text, 'materialized'::text]
      )
    ),
  trust_note text,
  caveats text,
  status text NOT NULL DEFAULT 'active'
    CHECK (
      status = ANY (
        ARRAY['draft'::text, 'active'::text, 'watch'::text, 'deprecated'::text]
      )
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_metric_registry_status
  ON public.admin_metric_registry (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_metric_registry_owner
  ON public.admin_metric_registry (owner_email, updated_at DESC);

ALTER TABLE public.admin_metric_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_metric_registry;
CREATE POLICY service_role_only
ON public.admin_metric_registry
USING (false);

REVOKE ALL ON TABLE public.admin_metric_registry FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_metric_registry TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'admin_metric_registry_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_metric_registry_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_metric_registry_id_seq TO service_role;
  END IF;
END $$;

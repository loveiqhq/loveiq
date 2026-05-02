CREATE TABLE IF NOT EXISTS public.admin_alert_rule (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email text NOT NULL,
  owner_email text,
  label text NOT NULL,
  target_type text NOT NULL
    CHECK (
      target_type = ANY (
        ARRAY['guardrail'::text, 'service'::text, 'trust'::text, 'action'::text, 'decision'::text]
      )
    ),
  target_key text NOT NULL,
  comparator text NOT NULL
    CHECK (comparator = ANY (ARRAY['gte'::text, 'lte'::text, 'eq'::text])),
  threshold_numeric numeric NOT NULL,
  severity text NOT NULL DEFAULT 'watch'
    CHECK (severity = ANY (ARRAY['good'::text, 'watch'::text, 'risk'::text])),
  linked_href text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_alert_rule_target
  ON public.admin_alert_rule (target_type, target_key, is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_alert_rule_owner
  ON public.admin_alert_rule (owner_email, updated_at DESC);

ALTER TABLE public.admin_alert_rule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_alert_rule;
CREATE POLICY service_role_only
ON public.admin_alert_rule
USING (false);

REVOKE ALL ON TABLE public.admin_alert_rule FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_alert_rule TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'admin_alert_rule_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_alert_rule_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_alert_rule_id_seq TO service_role;
  END IF;
END $$;

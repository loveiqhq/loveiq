CREATE TABLE IF NOT EXISTS public.admin_metric_status (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email text NOT NULL,
  metric_key text NOT NULL UNIQUE,
  status_state text NOT NULL DEFAULT 'watch'
    CHECK (
      status_state = ANY (
        ARRAY['on-track'::text, 'watch'::text, 'off-track'::text, 'critical'::text]
      )
    ),
  status_reason text,
  owner_email text,
  review_due_at date,
  last_reviewed_at timestamptz,
  leading_indicator_key text,
  leading_indicator_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_metric_status_state
  ON public.admin_metric_status (status_state, review_due_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_metric_status_owner
  ON public.admin_metric_status (owner_email, updated_at DESC);

ALTER TABLE public.admin_metric_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_metric_status;
CREATE POLICY service_role_only
ON public.admin_metric_status
USING (false);

REVOKE ALL ON TABLE public.admin_metric_status FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_metric_status TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'admin_metric_status_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_metric_status_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_metric_status_id_seq TO service_role;
  END IF;
END $$;

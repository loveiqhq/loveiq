CREATE TABLE IF NOT EXISTS public.admin_review_request (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email text NOT NULL,
  title text NOT NULL,
  description text,
  resource_type text NOT NULL
    CHECK (
      resource_type = ANY (
        ARRAY[
          'metric-registry'::text,
          'alert-policy'::text,
          'decision-entry'::text,
          'release-entry'::text,
          'experiment'::text,
          'benchmark'::text,
          'general'::text
        ]
      )
    ),
  resource_id bigint,
  linked_metric_key text,
  impact_level text NOT NULL DEFAULT 'medium'
    CHECK (
      impact_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])
    ),
  status text NOT NULL DEFAULT 'requested'
    CHECK (
      status = ANY (
        ARRAY[
          'requested'::text,
          'in-review'::text,
          'approved'::text,
          'changes-requested'::text,
          'rejected'::text
        ]
      )
    ),
  reviewer_email text,
  decision_note text,
  source_href text,
  due_date date,
  payload_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_review_request_status_due
  ON public.admin_review_request (status, due_date, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_review_request_resource
  ON public.admin_review_request (resource_type, resource_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_review_request_metric
  ON public.admin_review_request (linked_metric_key, updated_at DESC)
  WHERE linked_metric_key IS NOT NULL;

ALTER TABLE public.admin_review_request ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_review_request;
CREATE POLICY service_role_only
ON public.admin_review_request
USING (false);

REVOKE ALL ON TABLE public.admin_review_request FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_review_request TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'admin_review_request_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_review_request_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_review_request_id_seq TO service_role;
  END IF;
END $$;

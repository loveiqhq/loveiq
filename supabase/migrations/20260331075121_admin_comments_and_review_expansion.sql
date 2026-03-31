CREATE TABLE IF NOT EXISTS public.admin_resource_comment (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email text NOT NULL,
  resource_type text NOT NULL
    CHECK (
      resource_type = ANY (
        ARRAY[
          'metric-registry'::text,
          'release-entry'::text,
          'decision-entry'::text,
          'chart-annotation'::text,
          'strategy-initiative'::text,
          'strategy-bet'::text,
          'competitive-watch'::text,
          'metric-dependency'::text,
          'review-request'::text,
          'alert-policy'::text,
          'benchmark'::text,
          'general'::text
        ]
      )
    ),
  resource_id bigint NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_resource_comment_content_length
    CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_admin_resource_comment_resource
  ON public.admin_resource_comment (resource_type, resource_id, created_at DESC);

ALTER TABLE public.admin_resource_comment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_resource_comment;
CREATE POLICY service_role_only
ON public.admin_resource_comment
USING (false);

REVOKE ALL ON TABLE public.admin_resource_comment FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_resource_comment TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'admin_resource_comment_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_resource_comment_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_resource_comment_id_seq TO service_role;
  END IF;
END $$;

ALTER TABLE public.admin_review_request
  DROP CONSTRAINT IF EXISTS admin_review_request_resource_type_check;

ALTER TABLE public.admin_review_request
  ADD CONSTRAINT admin_review_request_resource_type_check
  CHECK (
    resource_type = ANY (
      ARRAY[
        'metric-registry'::text,
        'alert-policy'::text,
        'decision-entry'::text,
        'release-entry'::text,
        'experiment'::text,
        'benchmark'::text,
        'strategy-initiative'::text,
        'strategy-bet'::text,
        'competitive-watch'::text,
        'metric-dependency'::text,
        'general'::text
      ]
    )
  );

CREATE TABLE IF NOT EXISTS public.admin_research_repository_entry (
  id BIGSERIAL PRIMARY KEY,
  admin_email TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NULL,
  entry_type TEXT NOT NULL
    CHECK (
      entry_type = ANY (
        ARRAY[
          'signal'::text,
          'theme'::text,
          'pain-point'::text,
          'contradiction'::text,
          'wording'::text,
          'answer-quality'::text,
          'custom'::text
        ]
      )
    ),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (
      status = ANY (
        ARRAY['draft'::text, 'active'::text, 'validated'::text, 'archived'::text]
      )
    ),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (
      priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])
    ),
  owner_email TEXT NULL,
  primary_metric_key TEXT NULL,
  question_id TEXT NULL,
  theme TEXT NULL,
  source_key TEXT NULL,
  source_href TEXT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendation TEXT NULL,
  linked_action_id BIGINT NULL REFERENCES public.admin_action_item(id) ON DELETE SET NULL,
  review_date DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_research_repository_entry_evidence_array
    CHECK (jsonb_typeof(evidence) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_admin_research_repository_status_priority
  ON public.admin_research_repository_entry (status, priority, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_research_repository_metric
  ON public.admin_research_repository_entry (primary_metric_key, updated_at DESC)
  WHERE primary_metric_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_research_repository_question
  ON public.admin_research_repository_entry (question_id, updated_at DESC)
  WHERE question_id IS NOT NULL;

ALTER TABLE public.admin_research_repository_entry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_research_repository_entry;
CREATE POLICY service_role_only
ON public.admin_research_repository_entry
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON TABLE public.admin_research_repository_entry FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_research_repository_entry TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S'
      AND c.relname = 'admin_research_repository_entry_id_seq'
      AND n.nspname = 'public'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_research_repository_entry_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_research_repository_entry_id_seq TO service_role;
  END IF;
END $$;

ALTER TABLE public.admin_resource_comment
  DROP CONSTRAINT IF EXISTS admin_resource_comment_resource_type_check;

ALTER TABLE public.admin_resource_comment
  ADD CONSTRAINT admin_resource_comment_resource_type_check
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
        'research-entry'::text,
        'general'::text
      ]
    )
  );

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
        'research-entry'::text,
        'general'::text
      ]
    )
  );

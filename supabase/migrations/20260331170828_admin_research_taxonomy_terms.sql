CREATE TABLE IF NOT EXISTS public.admin_research_taxonomy_term (
  id BIGSERIAL PRIMARY KEY,
  admin_email TEXT NOT NULL,
  label TEXT NOT NULL,
  taxonomy_type TEXT NOT NULL
    CHECK (
      taxonomy_type = ANY (
        ARRAY['intent'::text, 'motivation'::text, 'theme'::text]
      )
    ),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (
      status = ANY (
        ARRAY['draft'::text, 'active'::text, 'deprecated'::text]
      )
    ),
  description TEXT NULL,
  owner_email TEXT NULL,
  linked_question_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  example_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_date DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_research_taxonomy_linked_question_ids_array
    CHECK (jsonb_typeof(linked_question_ids) = 'array'),
  CONSTRAINT admin_research_taxonomy_example_terms_array
    CHECK (jsonb_typeof(example_terms) = 'array'),
  CONSTRAINT admin_research_taxonomy_source_keys_array
    CHECK (jsonb_typeof(source_keys) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_admin_research_taxonomy_type_status
  ON public.admin_research_taxonomy_term (taxonomy_type, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_research_taxonomy_review_date
  ON public.admin_research_taxonomy_term (review_date, updated_at DESC)
  WHERE review_date IS NOT NULL;

ALTER TABLE public.admin_research_taxonomy_term ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_research_taxonomy_term;
CREATE POLICY service_role_only
ON public.admin_research_taxonomy_term
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON TABLE public.admin_research_taxonomy_term FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_research_taxonomy_term TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S'
      AND c.relname = 'admin_research_taxonomy_term_id_seq'
      AND n.nspname = 'public'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_research_taxonomy_term_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_research_taxonomy_term_id_seq TO service_role;
  END IF;
END $$;

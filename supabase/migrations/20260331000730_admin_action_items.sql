CREATE TABLE IF NOT EXISTS public.admin_action_item (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email text NOT NULL,
  owner_email text,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status = ANY (ARRAY['open'::text, 'in-progress'::text, 'blocked'::text, 'done'::text])),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])),
  source_type text NOT NULL DEFAULT 'general'
    CHECK (
      source_type = ANY (
        ARRAY[
          'general'::text,
          'metric'::text,
          'decision'::text,
          'experiment'::text,
          'release'::text,
          'investigation'::text
        ]
      )
    ),
  source_id bigint,
  metric_key text,
  linked_href text,
  due_date date,
  review_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_action_item_status_priority
  ON public.admin_action_item (status, priority, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_action_item_owner
  ON public.admin_action_item (owner_email, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_action_item_due_date
  ON public.admin_action_item (due_date)
  WHERE due_date IS NOT NULL;

ALTER TABLE public.admin_action_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_action_item;
CREATE POLICY service_role_only
ON public.admin_action_item
USING (false);

REVOKE ALL ON TABLE public.admin_action_item FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_action_item TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'admin_action_item_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_action_item_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_action_item_id_seq TO service_role;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.admin_strategy_initiative (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'planned'
    CHECK (
      status = ANY (
        ARRAY['planned'::text, 'active'::text, 'watch'::text, 'blocked'::text, 'completed'::text]
      )
    ),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
  owner_email text,
  goal_id bigint REFERENCES public.admin_goals(id) ON DELETE SET NULL,
  primary_metric_key text,
  secondary_metric_keys text[] NOT NULL DEFAULT '{}'::text[],
  expected_impact text,
  review_date date,
  linked_href text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_strategy_initiative_status_priority
  ON public.admin_strategy_initiative (status, priority, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_strategy_initiative_goal
  ON public.admin_strategy_initiative (goal_id, updated_at DESC)
  WHERE goal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_strategy_initiative_metric
  ON public.admin_strategy_initiative (primary_metric_key, updated_at DESC)
  WHERE primary_metric_key IS NOT NULL;

ALTER TABLE public.admin_strategy_initiative ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_strategy_initiative;
CREATE POLICY service_role_only
ON public.admin_strategy_initiative
USING (false);

REVOKE ALL ON TABLE public.admin_strategy_initiative FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_strategy_initiative TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'admin_strategy_initiative_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_strategy_initiative_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_strategy_initiative_id_seq TO service_role;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.admin_strategy_bet (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email text NOT NULL,
  title text NOT NULL,
  hypothesis text NOT NULL,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (
      status = ANY (
        ARRAY[
          'proposed'::text,
          'active'::text,
          'validated'::text,
          'invalidated'::text,
          'parked'::text
        ]
      )
    ),
  confidence text NOT NULL DEFAULT 'medium'
    CHECK (confidence = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
  upside_note text,
  downside_note text,
  primary_metric_key text,
  review_date date,
  owner_email text,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_strategy_bet_status_review
  ON public.admin_strategy_bet (status, review_date, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_strategy_bet_metric
  ON public.admin_strategy_bet (primary_metric_key, updated_at DESC)
  WHERE primary_metric_key IS NOT NULL;

ALTER TABLE public.admin_strategy_bet ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_strategy_bet;
CREATE POLICY service_role_only
ON public.admin_strategy_bet
USING (false);

REVOKE ALL ON TABLE public.admin_strategy_bet FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_strategy_bet TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'admin_strategy_bet_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_strategy_bet_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_strategy_bet_id_seq TO service_role;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.admin_competitive_watch (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email text NOT NULL,
  competitor_name text NOT NULL,
  move_type text NOT NULL
    CHECK (
      move_type = ANY (
        ARRAY[
          'feature'::text,
          'pricing'::text,
          'positioning'::text,
          'distribution'::text,
          'partnership'::text,
          'brand'::text,
          'other'::text
        ]
      )
    ),
  title text NOT NULL,
  detail text NOT NULL,
  impact_level text NOT NULL DEFAULT 'medium'
    CHECK (
      impact_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])
    ),
  primary_metric_key text,
  recommended_response text,
  source_href text,
  observed_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_competitive_watch_impact
  ON public.admin_competitive_watch (impact_level, observed_at DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_competitive_watch_metric
  ON public.admin_competitive_watch (primary_metric_key, updated_at DESC)
  WHERE primary_metric_key IS NOT NULL;

ALTER TABLE public.admin_competitive_watch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_competitive_watch;
CREATE POLICY service_role_only
ON public.admin_competitive_watch
USING (false);

REVOKE ALL ON TABLE public.admin_competitive_watch FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_competitive_watch TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'admin_competitive_watch_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_competitive_watch_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_competitive_watch_id_seq TO service_role;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.admin_metric_dependency (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email text NOT NULL,
  parent_metric_key text NOT NULL,
  child_metric_key text NOT NULL,
  relationship_strength text NOT NULL DEFAULT 'medium'
    CHECK (
      relationship_strength = ANY (ARRAY['weak'::text, 'medium'::text, 'strong'::text])
    ),
  hypothesis_note text,
  evidence_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_metric_dependency_distinct_metrics CHECK (parent_metric_key <> child_metric_key),
  CONSTRAINT admin_metric_dependency_unique_pair UNIQUE (parent_metric_key, child_metric_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_metric_dependency_parent
  ON public.admin_metric_dependency (parent_metric_key, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_metric_dependency_child
  ON public.admin_metric_dependency (child_metric_key, updated_at DESC);

ALTER TABLE public.admin_metric_dependency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_metric_dependency;
CREATE POLICY service_role_only
ON public.admin_metric_dependency
USING (false);

REVOKE ALL ON TABLE public.admin_metric_dependency FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_metric_dependency TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'admin_metric_dependency_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_metric_dependency_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_metric_dependency_id_seq TO service_role;
  END IF;
END $$;

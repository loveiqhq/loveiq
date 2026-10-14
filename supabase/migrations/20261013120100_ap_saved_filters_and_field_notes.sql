-- Two small admin tables for AP-Analytics (/admin/ap):
--
-- admin_ap_saved_filter  the filter bar's saved filters and the raw data explorer's saved
--                        views: one row per saved state, the owner's own or shared with the
--                        team. `filters` holds the URL parameters (a preset stays relative:
--                        "Last 30 days" is always the last 30 days).
-- admin_field_note       the team's own description of a table (relation) or a field in the
--                        data catalog, edited in place (field '' is the table itself).
--
-- No column is called *name: the team data export (team-export.ts) stops on any column whose
-- name looks personal and that no list classifies, so these are title, relation and field.
--
-- Both are read and written only by the server (service role), as every admin table.

CREATE TABLE IF NOT EXISTS public.admin_ap_saved_filter (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email text NOT NULL,
  kind        text NOT NULL DEFAULT 'filter' CHECK (kind IN ('filter', 'explorer')),
  title       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  filters     jsonb NOT NULL CHECK (jsonb_typeof(filters) = 'object'),
  is_shared   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- migration-lint: ignore. A plain index, not CONCURRENTLY: the table is created empty just
-- above, in the same transaction, so there is nothing to lock out.
CREATE INDEX IF NOT EXISTS idx_admin_ap_saved_filter_email ON public.admin_ap_saved_filter (admin_email);

ALTER TABLE public.admin_ap_saved_filter ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only" ON public.admin_ap_saved_filter;
CREATE POLICY "service_role_only" ON public.admin_ap_saved_filter
  FOR ALL USING ((SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
REVOKE ALL ON public.admin_ap_saved_filter FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_ap_saved_filter TO service_role;

CREATE TABLE IF NOT EXISTS public.admin_field_note (
  source      text NOT NULL CHECK (source IN ('production', 'posthog', 'ga4', 'ads')),
  relation    text NOT NULL CHECK (char_length(relation) BETWEEN 1 AND 120),
  field       text NOT NULL DEFAULT '' CHECK (char_length(field) <= 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 600),
  updated_by  text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, relation, field)
);

ALTER TABLE public.admin_field_note ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only" ON public.admin_field_note;
CREATE POLICY "service_role_only" ON public.admin_field_note
  FOR ALL USING ((SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
REVOKE ALL ON public.admin_field_note FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_field_note TO service_role;

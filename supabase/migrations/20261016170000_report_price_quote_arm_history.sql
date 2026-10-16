-- Keep every report's price-test history (16 Oct 2026), so a price test that has ended can
-- still be measured.
--
-- THE PROBLEM. `report_price_quote.experiment_group` says which price list a quote is on NOW.
-- A re-sync moves every unpaid quote onto the next test's list: 20261005120100 rewrote 4,360
-- unpaid 2.x quotes from A/B to A3/B3, so on 14 Oct Jarvis told Marcus the 2.x split "can't be
-- measured". The old values survived only in ad-hoc keys no reader used (metadata.pricing2,
-- metadata.pricing3b), and the next re-sync keeps history only if its author remembers to.
--
-- THE FIX. One row per change to a quote's arm or list price, written by a trigger, so it is
-- kept whoever changes the row and however. A reader puts a quote in the arm it was DEALT:
-- the old arm of its first change, else the one it carries (features/admin/server/
-- experiment-readouts.ts, and get_arm_cohorts / get_axis_funnel_daily below), and a finished
-- test is split at every change of a price list (get_price_list_changes below).
--
-- THE TRIGGER CANNOT FAIL A QUOTE WRITE. The engine writes the quote on every visit, and a
-- failed write is "Pricing unavailable" on the paygate for that reader. So:
--   - it fires only when experiment_group, msrp or starting_price actually change (IS DISTINCT
--     FROM). A visit rewrites all three with the values the row already holds (buildQuotePayload
--     reads them off the row) and changes current_price, discount_step, view_count, metadata
--     and the timestamps, none of which fire it. The checkout, purchase, paywall, nurture and
--     chapter-nudge writes do not name the three at all;
--   - one INSERT and no other logic, into a table with no CHECK and no NOT NULL a quote could
--     break, and its only foreign key is the quote being updated;
--   - and any error is caught and logged as a WARNING: a lost history row, never a lost quote.
-- The one visit that writes a row: the first re-quote of a quote stored before 2026-04 with no
-- msrp/starting_price, which the engine fills in once (2 such rows on production, both paid).
--
-- Ids, arm letters, prices and a time: nothing that identifies a person. Erased with its quote
-- (ON DELETE CASCADE), so the GDPR erasure that deletes the quotes takes this with them.
--
-- Rollback: supabase/rollbacks/20261016170000_report_price_quote_arm_history_down.sql.

CREATE TABLE IF NOT EXISTS public.report_price_quote_arm_history (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quote_id             bigint NOT NULL REFERENCES public.report_price_quote(id) ON DELETE CASCADE,
  personal_report_id   bigint,
  plan                 text,
  old_experiment_group text,
  new_experiment_group text,
  old_msrp             numeric,
  new_msrp             numeric,
  old_starting_price   numeric,
  new_starting_price   numeric,
  old_current_price    numeric,
  new_current_price    numeric,
  changed_at           timestamptz NOT NULL DEFAULT now(),
  source               text
);

-- migration-lint: ignore. A plain index, not CONCURRENTLY: the table is created empty just
-- above, in the same transaction, so there is nothing to lock out. It serves the readers (a
-- quote's changes, oldest first) and the cascade from a deleted quote.
CREATE INDEX IF NOT EXISTS report_price_quote_arm_history_quote_idx
  ON public.report_price_quote_arm_history (quote_id, changed_at);

ALTER TABLE public.report_price_quote_arm_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_price_quote_arm_history_service_only ON public.report_price_quote_arm_history;
CREATE POLICY report_price_quote_arm_history_service_only ON public.report_price_quote_arm_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.report_price_quote_arm_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.report_price_quote_arm_history TO service_role;
-- posthog_readonly keeps the SELECT production's default privileges give every new table. It
-- already reads report_price_quote, of which every column here is a copy, so revoking it
-- protects nothing and would leave the PostHog warehouse the one pricing table it cannot join.

COMMENT ON TABLE public.report_price_quote_arm_history IS
  'Every change to a price quote''s arm (experiment_group) or list price (msrp, starting_price), one row each, kept by a trigger since 2026-10-16 and backfilled from the 2026-10-06 and 2026-10-08 re-syncs. The arm a quote was dealt is the old arm of its first row, else the arm it carries.';
COMMENT ON COLUMN public.report_price_quote_arm_history.quote_id IS 'The quote, in report_price_quote.';
COMMENT ON COLUMN public.report_price_quote_arm_history.personal_report_id IS 'The report the quote prices.';
COMMENT ON COLUMN public.report_price_quote_arm_history.plan IS 'full_report, all_reports, core or essentials.';
COMMENT ON COLUMN public.report_price_quote_arm_history.old_experiment_group IS 'The price list arm before the change (A or B for the 2.x test, A3 or B3 for Pricing 3.0).';
COMMENT ON COLUMN public.report_price_quote_arm_history.new_experiment_group IS 'The arm after the change; the same as before when only the prices moved.';
COMMENT ON COLUMN public.report_price_quote_arm_history.old_msrp IS 'The struck-out list price before the change, EUR.';
COMMENT ON COLUMN public.report_price_quote_arm_history.new_msrp IS 'The struck-out list price after the change, EUR.';
COMMENT ON COLUMN public.report_price_quote_arm_history.old_starting_price IS 'The list''s selling price before the change, EUR.';
COMMENT ON COLUMN public.report_price_quote_arm_history.new_starting_price IS 'The list''s selling price after the change, EUR.';
COMMENT ON COLUMN public.report_price_quote_arm_history.old_current_price IS 'What the quote charged before the change, EUR.';
COMMENT ON COLUMN public.report_price_quote_arm_history.new_current_price IS 'What the quote charged after the change, EUR.';
COMMENT ON COLUMN public.report_price_quote_arm_history.changed_at IS 'When the change was made.';
COMMENT ON COLUMN public.report_price_quote_arm_history.source IS 'Who made it: the database role (postgres is a migration or hand-run SQL, service_role the app), or backfill:<migration> for a change recovered from that migration''s metadata.';

-- The two re-syncs that kept what they overwrote. Checked on production on 2026-10-16 that
-- these are the only metadata.pricing* keys, and that every row's values after the change
-- (metadata.pricing3b where the 10-08 re-sync moved it again, else the row) are exactly what
-- the re-sync wrote: 4,360 of 4,360 and 2,213 of 2,213. The re-syncs before 20261005120100
-- kept nothing, but none of them changed an arm. Idempotent: a backfilled quote is skipped.
INSERT INTO public.report_price_quote_arm_history (
  quote_id, personal_report_id, plan,
  old_experiment_group, new_experiment_group,
  old_msrp, new_msrp, old_starting_price, new_starting_price,
  old_current_price, new_current_price, changed_at, source)
SELECT q.id, q.personal_report_id, q.plan,
       q.metadata->'pricing2'->>'experimentGroup', q.experiment_group,
       (q.metadata->'pricing2'->>'msrp')::numeric,
       coalesce((q.metadata->'pricing3b'->>'msrp')::numeric, q.msrp),
       (q.metadata->'pricing2'->>'startingPrice')::numeric,
       coalesce((q.metadata->'pricing3b'->>'startingPrice')::numeric, q.starting_price),
       (q.metadata->'pricing2'->>'currentPrice')::numeric,
       coalesce((q.metadata->'pricing3b'->>'currentPrice')::numeric, q.current_price),
       (q.metadata->'pricing2'->>'resyncedAt')::timestamptz,
       'backfill:20261005120100'
  FROM public.report_price_quote q
 WHERE jsonb_typeof(q.metadata->'pricing2') = 'object'
   AND NOT EXISTS (SELECT 1 FROM public.report_price_quote_arm_history h
                    WHERE h.quote_id = q.id AND h.source = 'backfill:20261005120100');

INSERT INTO public.report_price_quote_arm_history (
  quote_id, personal_report_id, plan,
  old_experiment_group, new_experiment_group,
  old_msrp, new_msrp, old_starting_price, new_starting_price,
  old_current_price, new_current_price, changed_at, source)
SELECT q.id, q.personal_report_id, q.plan,
       q.experiment_group, q.experiment_group,
       (q.metadata->'pricing3b'->>'msrp')::numeric, q.msrp,
       (q.metadata->'pricing3b'->>'startingPrice')::numeric, q.starting_price,
       (q.metadata->'pricing3b'->>'currentPrice')::numeric, q.current_price,
       (q.metadata->'pricing3b'->>'resyncedAt')::timestamptz,
       'backfill:20261008120000'
  FROM public.report_price_quote q
 WHERE jsonb_typeof(q.metadata->'pricing3b') = 'object'
   AND NOT EXISTS (SELECT 1 FROM public.report_price_quote_arm_history h
                    WHERE h.quote_id = q.id AND h.source = 'backfill:20261008120000');

-- SECURITY INVOKER: only the roles that bypass the quote table's RLS (service_role, postgres)
-- can update a quote at all, and both may write here. Not revoked from anyone: a function
-- that returns trigger cannot be called on its own, and PostgREST does not expose one.
CREATE OR REPLACE FUNCTION public.report_price_quote_keep_arm_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.report_price_quote_arm_history (
    quote_id, personal_report_id, plan,
    old_experiment_group, new_experiment_group,
    old_msrp, new_msrp, old_starting_price, new_starting_price,
    old_current_price, new_current_price, source)
  VALUES (
    NEW.id, NEW.personal_report_id, NEW.plan,
    OLD.experiment_group, NEW.experiment_group,
    OLD.msrp, NEW.msrp, OLD.starting_price, NEW.starting_price,
    OLD.current_price, NEW.current_price, current_user);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never fail the quote write over its history.
  RAISE WARNING 'report_price_quote_arm_history not written for quote %: % (%)',
    NEW.id, SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS report_price_quote_keeps_arm_history ON public.report_price_quote;
CREATE TRIGGER report_price_quote_keeps_arm_history
  AFTER UPDATE OF experiment_group, msrp, starting_price ON public.report_price_quote
  FOR EACH ROW
  WHEN (OLD.experiment_group IS DISTINCT FROM NEW.experiment_group
     OR OLD.msrp IS DISTINCT FROM NEW.msrp
     OR OLD.starting_price IS DISTINCT FROM NEW.starting_price)
  EXECUTE FUNCTION public.report_price_quote_keep_arm_history();

-- Every change of a price list, oldest first: from `changed_at`, arm `arm` sold `plan` at
-- `starting_price`. The brain's `experiments` splits a finished pricing test at each one, so
-- one letter never pools two lists (list A changed its prices on 24 Aug, mid-test).
--
-- Before the history the re-syncs kept nothing, so the three 2.x changes are pinned here.
-- Each moment is the creation of the production deploy that changed the prices (Vercel; the
-- builds took one to two minutes, and each re-sync was applied right after), and the
-- price_shown events either side of it agree. Everything later comes from the history: a
-- re-sync moves many quotes of one arm and plan to one price at one moment, so a change to
-- a single quote (a hand fix) is not a list change: a group needs more than one quote.
CREATE OR REPLACE FUNCTION public.get_price_list_changes()
RETURNS TABLE(changed_at timestamptz, arm text, plan text, starting_price numeric, quotes integer)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT v.changed_at, v.arm, v.plan, v.starting_price, NULL::integer
    FROM (VALUES
      -- Pricing 2.0 (20260727130000): both lists flat. The first production deploy carrying
      -- it, 040913fcb after merge 86eb94125. price_shown: the old lists last at 18:20:51 UTC,
      -- 2.0's first at 23:08:58.
      (timestamptz '2026-08-03 20:09:45+00', 'A', 'full_report', 9.99),
      (timestamptz '2026-08-03 20:09:45+00', 'A', 'core', 19.99),
      (timestamptz '2026-08-03 20:09:45+00', 'A', 'all_reports', 29.99),
      (timestamptz '2026-08-03 20:09:45+00', 'B', 'full_report', 29.00),
      (timestamptz '2026-08-03 20:09:45+00', 'B', 'core', 39.00),
      (timestamptz '2026-08-03 20:09:45+00', 'B', 'all_reports', 49.00),
      -- Pricing 2.1 raised list A (20260824120000): the deploy of 662bf271d. price_shown:
      -- list A's old prices last on 23 Aug 05:59:23, its new ones first on 24 Aug 18:42:54,
      -- and no reader finished between 01:40 and 05:22 that night.
      (timestamptz '2026-08-24 02:43:12+00', 'A', 'full_report', 39.99),
      (timestamptz '2026-08-24 02:43:12+00', 'A', 'core', 49.99),
      (timestamptz '2026-08-24 02:43:12+00', 'A', 'all_reports', 59.00),
      -- The 2.x test ended: list A retired, its unpaid quotes on list B's prices and every
      -- new quote B (20260831101238, applied 10:12:38): the deploy of merge 38bfb4346.
      -- price_shown: list A last at 09:59:32, only list B from 19:13:43.
      (timestamptz '2026-08-31 10:09:20+00', 'A', 'full_report', 29.00),
      (timestamptz '2026-08-31 10:09:20+00', 'A', 'core', 39.00),
      (timestamptz '2026-08-31 10:09:20+00', 'A', 'all_reports', 49.00)
    ) AS v(changed_at, arm, plan, starting_price)
  UNION ALL
  SELECT h.changed_at, h.new_experiment_group, h.plan, h.new_starting_price, count(*)::integer
    FROM report_price_quote_arm_history h
   WHERE h.old_starting_price IS NOT NULL
     AND (h.old_experiment_group, h.old_starting_price)
         IS DISTINCT FROM (h.new_experiment_group, h.new_starting_price)
   GROUP BY h.changed_at, h.new_experiment_group, h.plan, h.new_starting_price
  HAVING count(*) > 1
   ORDER BY 1, 2, 3
$function$;

REVOKE ALL ON FUNCTION public.get_price_list_changes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_price_list_changes() TO service_role;

-- The digest's two arm readouts put a reader in the arm their quote was dealt, not the one it
-- carries now. Before this, a window from before a re-sync read its readers on the next
-- test's lists: get_arm_cohorts took the first quote's current stamp, and get_axis_funnel_daily
-- dropped every re-priced 2.x reader as "plans disagree" (core and essentials were never
-- re-synced, full_report and all_reports were). A window that starts at the 3.0 launch
-- (2026-10-06 18:18:28 UTC) or later reads exactly as before: every quote made since was dealt
-- the A3 or B3 it still carries. One that starts earlier reads differently, and correctly:
-- readers dealt 2.x list B before the launch now count as B, not as the A3/B3 their quotes
-- were moved to (get_arm_cohorts from 5 Oct, measured 16 Oct: B 18 to 30, A3 77 to 72, B3 81
-- to 74). By substitution against the live bodies (both have the expression exactly twice,
-- identical on production and staging), so each body is the previous one plus this change;
-- anything else raises and applies nothing.
DO $migration$
DECLARE
  fn text;
  body text;
  old_expr CONSTANT text := 'COALESCE(q.experiment_group, q.base_price_bucket)';
  new_expr CONSTANT text :=
    'COALESCE((SELECT h.old_experiment_group FROM report_price_quote_arm_history h'
    ' WHERE h.quote_id = q.id ORDER BY h.changed_at, h.id LIMIT 1),'
    ' q.experiment_group, q.base_price_bucket)';
BEGIN
  FOREACH fn IN ARRAY ARRAY['get_arm_cohorts', 'get_axis_funnel_daily'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO body
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = fn;
    IF body IS NULL THEN
      RAISE EXCEPTION '%: not found, nothing was changed', fn;
    END IF;
    IF (length(body) - length(replace(body, old_expr, ''))) / length(old_expr) <> 2 THEN
      RAISE EXCEPTION '%: expected exactly 2 copies of %, nothing was changed', fn, old_expr;
    END IF;
    EXECUTE replace(body, old_expr, new_expr);
  END LOOP;
END
$migration$;

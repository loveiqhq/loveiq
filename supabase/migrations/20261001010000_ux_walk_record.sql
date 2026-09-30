-- The persona walks the UX checker's measures are proven on (features/ux-signals).
--
-- WHY. Marcus's 22 behaviour signals are measured on real visits from PostHog, and a signal
-- is shown only once its measure has been right on at least 80% of the walks
-- (features/ux-signals/logic/proof.ts). A proof walk (scripts/walkers/walk.ts --proof) runs
-- production's code on staging's database and plants the behaviours on purpose, so it knows
-- the truth: this is where that truth is kept, with the events the walk's browser heard.
--
-- EVENTS, NOT VERDICTS. The measure is run again over these events on every read, so a
-- measure that changes is judged at once on every walk there is, never on what older code
-- said. The events are a scripted walker's on staging: no visitor, no person, report tokens
-- and Stripe sessions scrubbed before they are written (scripts/walkers/plants.ts).

CREATE TABLE IF NOT EXISTS public.ux_walk_record (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  walked_at  timestamptz NOT NULL,
  -- persona--device, e.g. `spark-seeker--iphone-15-pro`
  walk       text NOT NULL,
  -- The GitHub Actions run, so a night's walks are found together and a rerun of the same
  -- run does not add them twice. Null for a walk run by hand.
  run_id     text,
  origin     text NOT NULL,
  -- What track() sent, as the walk's browser heard it: [{t, event, props}].
  events     jsonb NOT NULL,
  -- What the walk knows it did: {signal name: value}.
  truth      jsonb NOT NULL,
  -- The planted behaviours, and any the site would not let it carry out.
  planted    jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (run_id, walk)
);

-- migration-lint: ignore. A plain index, not CONCURRENTLY: the table is created empty just
-- above, so there is nothing to lock, and CONCURRENTLY cannot run in this migration's
-- transaction.
CREATE INDEX IF NOT EXISTS ux_walk_record_walked_at_idx
  ON public.ux_walk_record (walked_at DESC);

COMMENT ON TABLE public.ux_walk_record IS
  'Persona walks the UX checker proves its measures on: each walk''s events and what it '
  'knows it did. Scripted walks on staging only; no visitor data.';

ALTER TABLE public.ux_walk_record ENABLE ROW LEVEL SECURITY;
-- Service role only, like every other operational table here. No policy is created, so
-- anon and authenticated reach nothing.

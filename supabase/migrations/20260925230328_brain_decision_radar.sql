-- The decision radar's bookkeeping: pairs of recorded decisions that cannot both stand, and
-- which topics have been checked against which set of decisions.
--
-- WHY. 185 of 200 decisions are mined from meeting notes, and nothing compared one with
-- another: "Require Jira tickets for all major features" (2026-05-15) and a September
-- decision whose own reason is "concerns with using Notion for tracking bug fixes" both
-- stood as current, and a reader could not tell which tool the team uses. The radar
-- (features/brain/server/radar.ts) finds such pairs with a model, checks each one twice,
-- and records them here until a person settles them.
--
-- NOT CHUNKS, for the reason brain_mine_log gives: anything in brain_chunk is searchable.
-- The open findings are ALSO written onto the two decision records themselves
-- (meta.disputed_by), which is how search and fetch_document show them; this table is the
-- authority that keeps that in sync, and remembers settled pairs so they are not raised
-- again.

CREATE TABLE IF NOT EXISTS public.brain_decision_conflict (
  -- The two decisions, oldest first by decided date, as brain_chunk source_ids.
  earlier     text NOT NULL,
  later       text NOT NULL,
  topic       text,
  -- "reverses": the later replaces the earlier. "unclear": different answers to the same
  -- question, so a reader cannot tell which applies.
  kind        text NOT NULL CHECK (kind IN ('reverses', 'unclear')),
  -- The model's one sentence on what they disagree on.
  why         text NOT NULL,
  found_on    date NOT NULL DEFAULT CURRENT_DATE,
  -- open until a person settles it: one stands (the other is marked superseded), or both do.
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'both_stand')),
  settled_by  text,
  settled_on  date,
  note        text,
  PRIMARY KEY (earlier, later)
);

CREATE TABLE IF NOT EXISTS public.brain_radar_topic (
  topic       text PRIMARY KEY,
  -- A hash of the topic's current decision ids: a new, changed or superseded decision
  -- changes it, and only then is the topic checked again.
  ids_hash    text NOT NULL,
  checked_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.brain_decision_conflict IS
  'Pairs of recorded decisions that cannot both stand, found by the decision radar and '
  'open until a person settles them. Bookkeeping only: the decisions live in brain_chunk.';
COMMENT ON TABLE public.brain_radar_topic IS
  'Which decision topics the radar has checked, against which set of decision ids.';

ALTER TABLE public.brain_decision_conflict ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_radar_topic ENABLE ROW LEVEL SECURITY;
-- Service role only, like every other operational table here. No policy is created, so
-- anon and authenticated reach nothing.

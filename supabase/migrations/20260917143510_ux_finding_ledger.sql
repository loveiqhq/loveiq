-- One row per scanner observation the verifier has answered.
--
-- WHY THIS EXISTS. Nothing recorded what the UX-review pipeline concluded. A
-- verdict lived only as a Slack thread reply, and when a session had no thread
-- -- 2 of 8 on the runs measured -- it was printed to a CI log and discarded.
-- `slack_alert_sent` records DELIVERY only: a contradicted finding and a
-- reproduced one write byte-identical rows. So the questions that matter could
-- not be asked of our own data at all:
--
--   * how often does a scanner's claim actually reproduce?
--   * does confidence predict anything? (0.8-1.0 on both verdicts across every
--     reading so far, but that is 7 hand-curated fixtures, not a population.)
--   * which criteria keep arriving with no probe to check them?
--
-- The only precision number we have comes from `scripts/replay-bench/`, seven
-- fixtures whose recordings EXPIRE 2026-09-28 and cannot be re-scanned, because
-- a scanner observes a given session once ever. A probe outcome, by contrast,
-- costs nothing to collect and never expires.
--
-- Bookkeeping, not corpus: deliberately not a `brain_chunk`, for the same reason
-- `brain_mine_log` is not one. Nobody should retrieve this by searching.
CREATE TABLE IF NOT EXISTS public.ux_finding (
  -- The PostHog `$recording_observed` event uuid. One row per observation, and
  -- the verifier claims each exactly once, so a re-run updates rather than
  -- duplicates.
  observation_id    text PRIMARY KEY,
  session_id        text NOT NULL,
  scanner_name      text,
  scanner_version   real,
  -- Recorded precisely because it is suspected of being meaningless. With a
  -- population instead of seven fixtures, "does confidence predict reproduction"
  -- becomes a query rather than an opinion.
  confidence        real,
  reasoning         text,

  -- NULL when the classifier matched nothing, which is itself the finding: a
  -- criterion the scanners keep raising and no probe covers.
  criterion         text,

  -- reproduced  a probe failed in production
  -- clear       every probe passed
  -- inconclusive at least one probe could not measure, none reproduced
  -- gap         no criterion matched, or the criterion has no probe
  -- contradicted our own events say the described thing did not happen
  -- duplicate   same (session, criterion) already probed in this run
  outcome           text NOT NULL CHECK (
    outcome IN ('reproduced', 'clear', 'inconclusive', 'gap', 'contradicted', 'duplicate')
  ),
  contradiction_reason text,

  -- [{ file, passed, inconclusive, tail }] -- the probe's own words, so a
  -- verdict can be re-read without the Slack thread it was posted into.
  probe_runs        jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- What the run was actually pointed at. Until 2026-09-17 the verdict claimed
  -- every probe ran "at the size this reader had" while one of fourteen did.
  devices           text,
  viewport_min      integer,
  viewport_max      integer,
  os                text,
  -- From the session's own dead_click/rage_click event, when it had one.
  url_path          text,
  target_selector   text,

  pr_url            text,
  -- False when there was no Slack thread to post into. Previously that verdict
  -- was simply lost.
  delivered         boolean NOT NULL DEFAULT false,

  -- The cheapest ground truth there is, and it costs nobody any curation: a
  -- merged reproduction PR means the finding was real, a closed one means it
  -- was not. Null until someone says.
  human_label       text CHECK (human_label IN ('agree', 'disagree')),
  labelled_at       timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ux_finding IS
  'One row per UX-review observation the verifier answered, with the probe results and '
  'what the run was pointed at. Exists because verdicts previously survived only as Slack '
  'thread replies, so precision could never be computed from our own data.';

-- The two questions this table is for: "what happened lately" and "how does
-- this criterion do".
CREATE INDEX IF NOT EXISTS ux_finding_created_idx ON public.ux_finding (created_at DESC);
CREATE INDEX IF NOT EXISTS ux_finding_criterion_outcome_idx
  ON public.ux_finding (criterion, outcome);

ALTER TABLE public.ux_finding ENABLE ROW LEVEL SECURITY;
-- Service role only, like every other operational table here. No policy is
-- created, so anon and authenticated reach nothing.

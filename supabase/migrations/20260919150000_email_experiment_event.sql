-- Daily per-arm counters for the email A/B tests, so their results can be read.
--
-- WHY THIS EXISTS. We run five email A/B tests — survey-complete, survey-paused,
-- two purchase variants and the three-way report-share — and as of 2026-09-19
-- not one of them could be read back. `pickEmailVariant` hashes the recipient,
-- picks a template, and that is the end of it: no column, no analytics property,
-- no tag. The experiments were unreadable BY CONSTRUCTION, and had been running
-- for weeks.
--
-- Marcus asked on 2026-08-24 for "a daily chart with CVR per experiment, Slack
-- pushed, winner confidence". Per EXPERIMENT. With only the landing test
-- readable, that chart can show exactly one experiment and silently omit five —
-- which is the class of quiet omission the whole KPI push exists to remove.
--
-- WHY A COUNTER TABLE AND NOT A ROW PER EMAIL. The question these tests ask is
-- "does variant B get opened and clicked more than variant A", which is a rate
-- over a population, not a per-person fact. Counters answer it in one small read
-- and carry no recipient identity at all — no email address, no user id, nothing
-- to purge later. `resend_webhook_event` was the other candidate and was
-- rejected: it exists for replay idempotency and is on the retention-purge list,
-- so experiment results stored there would be deleted by a job that has no idea
-- it is deleting them.
--
-- THE DENOMINATOR IS `delivered`, not `sent`. An email that never arrived cannot
-- be opened, so counting it in the denominator would penalise whichever arm drew
-- more dead addresses — noise that has nothing to do with the copy under test.
--
-- Arms come from the Resend webhook's echoed tags, which means they describe the
-- email that was actually sent rather than a re-derivation at read time. There
-- is no history: counting starts at this migration.

CREATE TABLE IF NOT EXISTS email_experiment_event (
  -- Berlin day, matching every other daily series in the digest.
  day          DATE NOT NULL,
  -- The experiment salt passed to pickEmailVariant, e.g. 'survey-complete'.
  experiment   TEXT NOT NULL,
  -- 'a' | 'b' | 'c'. Stored as free text on purpose: a three-way test already
  -- exists (report-share) and a CHECK listing today's arms would have to be
  -- migrated before a four-way one could ship.
  arm          TEXT NOT NULL,
  -- Resend's event type with the `email.` prefix stripped: delivered, opened,
  -- clicked, bounced, complained, failed.
  event_type   TEXT NOT NULL,
  n            INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, experiment, arm, event_type)
);

COMMENT ON TABLE email_experiment_event IS
  'Daily per-arm counters for the email A/B tests. No recipient identity — a rate '
  'over a population, not a per-person fact. Written by /api/resend/webhook from '
  'the tags Resend echoes back; read by the conversion digest.';

-- The digest reads one experiment across a 30-day window.
CREATE INDEX IF NOT EXISTS email_experiment_event_day_idx
  ON email_experiment_event (day DESC, experiment);

ALTER TABLE email_experiment_event ENABLE ROW LEVEL SECURITY;

-- Service role only, like every other operational table here. No policy for
-- anon/authenticated means no rows are visible to them even with RLS on.
DROP POLICY IF EXISTS email_experiment_event_service_only ON email_experiment_event;
CREATE POLICY email_experiment_event_service_only
  ON email_experiment_event
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON email_experiment_event FROM PUBLIC, anon, authenticated;
GRANT ALL ON email_experiment_event TO service_role;

-- Increment one counter. Written from the webhook, which sees one event at a
-- time and must not race another instance handling a sibling event for the same
-- (day, experiment, arm, event_type).
CREATE OR REPLACE FUNCTION bump_email_experiment_event(
  p_day        DATE,
  p_experiment TEXT,
  p_arm        TEXT,
  p_event_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  -- Bounded so a crafted or malfunctioning webhook cannot write unbounded text
  -- into a table the digest reads and prints into Slack.
  IF p_experiment IS NULL OR p_arm IS NULL OR p_event_type IS NULL
     OR length(p_experiment) > 64 OR length(p_arm) > 16 OR length(p_event_type) > 32 THEN
    RETURN;
  END IF;

  INSERT INTO email_experiment_event (day, experiment, arm, event_type, n)
  VALUES (p_day, p_experiment, p_arm, p_event_type, 1)
  ON CONFLICT (day, experiment, arm, event_type)
  DO UPDATE SET n = email_experiment_event.n + 1, updated_at = now();
END;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC, and SECURITY DEFINER bypasses the
-- RLS above — so without these REVOKEs anyone holding the published anon key
-- could inflate an experiment's counters and change which arm the digest calls
-- a winner.
REVOKE EXECUTE ON FUNCTION bump_email_experiment_event(DATE, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bump_email_experiment_event(DATE, TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION bump_email_experiment_event(DATE, TEXT, TEXT, TEXT) TO service_role;

-- Window totals per (experiment, arm), for the digest's per-experiment verdict.
-- Half-open [since_ts, until_ts), Berlin days, matching every sibling RPC.
CREATE OR REPLACE FUNCTION get_email_experiment_results(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  result JSON;
  since_day DATE := (since_ts AT TIME ZONE 'Europe/Berlin')::date;
  until_day DATE := (until_ts AT TIME ZONE 'Europe/Berlin')::date;
BEGIN
  SELECT COALESCE(json_agg(json_build_object(
           'experiment', t.experiment,
           'arm',        t.arm,
           'delivered',  t.delivered,
           'opened',     t.opened,
           'clicked',    t.clicked
         ) ORDER BY t.experiment, t.arm), '[]'::json)
    INTO result
    FROM (
      SELECT experiment,
             arm,
             COALESCE(SUM(n) FILTER (WHERE event_type = 'delivered'), 0)::int AS delivered,
             COALESCE(SUM(n) FILTER (WHERE event_type = 'opened'), 0)::int    AS opened,
             COALESCE(SUM(n) FILTER (WHERE event_type = 'clicked'), 0)::int   AS clicked
        FROM email_experiment_event
       WHERE day >= since_day AND day < until_day
       GROUP BY experiment, arm
    ) t;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_email_experiment_results(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_email_experiment_results(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_email_experiment_results(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

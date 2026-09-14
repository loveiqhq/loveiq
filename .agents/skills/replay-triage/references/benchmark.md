# Benchmarking the scanners

Marcus, 2026-09-11: the criteria "must be explicitly defined and benchmarked
against test videos so the team does not rely on false confidence."

## Running it

```bash
npm run replay:bench          # score what has been scanned
node scripts/replay-bench/score.mjs --selftest   # check the maths, no network
```

Fixtures live in `scripts/replay-bench/fixtures.json`. Scanning happens through
the PostHog MCP (`vision-scanners-scan-session`); the scorer reads verdicts back
out of `$recording_observed` events and grades them offline.

## Bars

- precision **≥ 0.80**, recall **≥ 0.60**, deliberately asymmetric: while a human
  is in the loop a missed bug is cheap, but a false alarm is the false confidence
  the requirement names.
- `inconclusive` counts as a **miss**, never a pass.
- Until every bar is met, Slack posts are prefixed `[unverified]` and **no PR is
  opened at all** — the loop stops after step 3.

## The trap: one observation per session, ever

A scanner can observe a given session **once**. Re-triggering it after a prompt
change is a silent no-op that returns the OLD verdict. So you cannot tune a
prompt against the same fixture with the same scanner.

Use `POST /vision/scanners/:id/duplicate/`, edit the copy's prompt, scan the same
fixtures with the copy, then delete the loser. Commit each revision's results to
`scripts/replay-bench/results/<scanner>.json` so the iteration is auditable.

## Fixtures must be verified, not remembered

The first run (2026-09-14) scored 0.50/0.50. Both survey failures traced to the
fixtures, not the model: one recording was labelled "iOS auto-zoom from a 15px
input" when the source thread actually describes the phone's display-zoom
accessibility setting, and the "known good" control may contain a real bug the
scanner correctly spotted.

**Watch a recording before asserting its expected verdict.** Tuning a prompt
against unverified expectations trains it on your assumptions.

Free fixtures: every triage ends by rating the observation, so re-reading with
`labeled=true` yields human-confirmed cases at no curation cost.

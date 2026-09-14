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

## The gate is the pull request, not the benchmark

A draft PR opens for every reproduced finding from day one. The PR **is** the
human-in-the-loop step: it carries the recording link, the reproduction, the fix
and a probe that fails without it, which is far more reviewable than a thumbs-up
on a Slack message.

The staging is about trust, not about whether work happens:

1. **Now** — every reproduced finding becomes a draft PR. Eman reads each one and
   asks why it was raised, to catch false alarms and anything missed.
2. **Once PRs come back clean consistently** — approve and merge without the
   interrogation.
3. **Never** — auto-merge. `gh pr create --draft`, and a human presses merge.

What the benchmark bars govern is the **confidence of the claim**, not whether a
PR is allowed. Below bar, say so in the PR body: "the scanner's criteria have not
yet cleared the benchmark (precision X, recall Y), so treat the diagnosis as
unconfirmed even though the fix is probe-verified." A finding that could not be
reproduced still never becomes a PR — that rule stands regardless of the bars.

## The trap: one observation per session, ever

A scanner can observe a given session **once**. Re-triggering it after a prompt
change is a silent no-op that returns the OLD verdict. So you cannot tune a
prompt against the same fixture with the same scanner.

Use `POST /vision/scanners/:id/duplicate/`, edit the copy's prompt, scan the same
fixtures with the copy, then delete the loser. Commit each revision's results to
`scripts/replay-bench/results/<scanner>.json` so the iteration is auditable.

## Fixtures must be verified, not remembered

### Where it stands: precision 0.25, recall 0.50 — below both bars

Measured 2026-09-14 against six fixtures, committed in
`scripts/replay-bench/results/v2.json` (written by the scorer, never by hand).
`tp 1 · fp 3 · fn 1`. **This is the number to quote to the team.** It is the
answer to Marcus's requirement that the criteria be benchmarked "so the team
does not rely on false confidence", and it says plainly: do not rely on it yet.

The three new false positives are the day-one findings, added as adversarial
fixtures. Each was checked against its session's own events and refuted — an
unlock click in a session with no click event; a redirect to the 18+ screen,
which is a step inside `/survey` and cannot emit a pageview; and the
self-refuting one, where the scanner described taps on "plain paragraphs and
non-interactive trust badges" and answered YES anyway, in the scanner whose
prompt carries a HARD RULE against exactly that.

That last one is the important result: **prompt hardening already failed.** The
v2 prompts carry both the anti-inference rule and the HARD RULE, and the model
broke both. Do not answer a precision of 0.25 by writing more prompt.

Confidence was 0.9–1.0 on every row above, correct and incorrect alike, so it
discriminates nothing and must not be published as if it did.

**Watch a recording before asserting its expected verdict.** Tuning a prompt
against unverified expectations trains it on your assumptions. Where a label
cannot be settled, put the fixture in `unresolved` — the scorer excludes it, so
a disputed label never drives the headline number. One sits there now
(`01a08680`): it was labelled "no" without watching, and the events partly
corroborate the scanner instead — `survey_completed`, then a fresh `/survey`
pageview 83s later, and no report pageview anywhere in the session.

Labels here are derived from EVENTS, and each fixture records that in
`labelled_from`. That is weaker than Mark's eyes for a layout question and
stronger for a causal claim, because an event either fired or it did not.

Free fixtures: every triage ends by rating the observation, so re-reading with
`labeled=true` yields human-confirmed cases at no curation cost.

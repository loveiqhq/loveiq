# features/ux-review

**Purpose:** Turn PostHog Replay Vision verdicts about session recordings into
evidence, or refuse to. The scanners watch every survey, report, rage-click and
dead-click recording and emit a verdict; this feature decides what, if anything,
the team is told.

**Entry:**

- `server/scanners.ts` — the four scanner prompts, verbatim and in git, plus each
  scanner's id, trigger event, credit cap and pinned version. Pure data.
- `server/review.ts` — reads observations (`fetchFindings`), refuses claims our
  own events contradict (`contradiction`), reads the reader's own screen and the
  element they tapped (`sessionViewport`, `sessionClickTarget`), builds the daily
  summary (`fetchDailyStats`, `buildDigestMessage`), and compares the live
  scanners against the ones pinned in git (`fetchScannerDrift`,
  `compareScanners`).

**The one rule that shapes everything: a verdict is not a finding.**

Measured 2026-09-14 — 31 observations, 5 flagged, and the stated mechanism was
wrong in all five. Confidence sat at 0.8–1.0 across _both_ verdicts, so it
discriminates nothing and is never published. The benchmark
(`scripts/replay-bench/`) scores precision 0.20 against a 0.80 bar, which is the
number to quote.

Prompt hardening does not fix this and must not be the reflex: the v2 prompts
already carry the anti-inference rule and a HARD RULE against flagging taps on
ordinary text, and the model broke both. The gate has to sit outside the model.

So a finding earns a Slack post only by being **reproduced in a real browser at
the viewport the session reported** — `scripts/verify-ux-findings.mjs`, on a
three-hourly schedule in CI. `app/api/cron/ux-review/route.ts` collects and posts
one summary a day; it cannot open a browser, so it publishes no findings.

**Two windows, and neither may be set from the schedule.** Both were, and both
lost readers — measured 2026-09-20, six days after the scanners went live.

|                                       | bounds                                                         | why it is not the schedule                                                                      |
| ------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `LOOKBACK_HOURS` (24)                 | how long a **deferred finding stays reachable**                | the workflow asks for eight runs a day and GitHub fires about five, with real gaps to **6h36m** |
| `DAYS` (14, `ux-review-coverage.mjs`) | how far back an **unwatched recording can still be re-queued** | PostHog holds every recording for ~27 days, so nothing needs abandoning inside a fortnight      |

The work is bounded separately and always: `PROBE_BUDGET` caps real browser time
per run, `MAX_ENQUEUE` caps observations queued per run, and both print what they
held over. **Bound the work, never the window** — a window shorter than the real
gap between runs turns "left for the next run" into silent deletion. It cost 9 of
60 findings (15%) and made every miss permanent after 48 hours.

**Set them in ONE place.** The workflow passes `LOOKBACK_HOURS` explicitly, so
when the script default moved 6 → 24 the unattended path kept 6 and the change
did nothing — visible only in the next run's own output, `28 finding(s) in the
last 6h`. The workflow input now exists solely so a manual run can NARROW the
window, and `__tests__/scripts/verifier-budget.test.ts` fails if the two numbers
disagree in either direction. A default the caller overrides is not a default.

There was a THIRD copy: `workflow_dispatch.inputs.lookback_hours` carried
`default: "6"`, which makes the input non-empty on every manual run, so the
`|| '24'` fallback never fired. Scheduled runs were fine; every dispatch — and
therefore every attempt to verify the fix by hand — quietly used the old window.
The input now has no default, and the test refuses one.

Both queries also drain **oldest-first**. Newest-first plus a per-run budget is a
starvation queue: the newest always outrank the tail, so the same items are
deferred every run until they leave the window.

**What it concluded is written down.** `public.ux_finding`, one row per
observation, written by the verifier at every terminal path — contradicted, gap,
duplicate, reproduced, clear, inconclusive. It carries the probe's own words, the
devices actually driven, and the page and element from the session's own
`dead_click` event. Before it, a verdict existed only as a Slack thread reply,
and a session with no thread (2 of 8 measured) had its verdict printed to a CI
log and discarded — those being the readers who never submitted the survey.

It is what makes the questions answerable from our own data:

```sql
-- how often does a claim actually reproduce, by criterion?
SELECT criterion, outcome, count(*) FROM ux_finding GROUP BY 1, 2 ORDER BY 1, 3 DESC;

-- does confidence predict anything? (0.8-1.0 on both verdicts so far, but that
-- is seven fixtures, not a population)
SELECT outcome, round(avg(confidence)::numeric, 3), count(*) FROM ux_finding
WHERE confidence IS NOT NULL GROUP BY 1;

-- verdicts that reached nobody, and which criteria keep arriving uncheckable
SELECT count(*) FILTER (WHERE NOT delivered) AS undelivered,
       count(*) FILTER (WHERE outcome = 'gap') AS no_probe FROM ux_finding;
```

`human_label` is deliberately null until someone says: a merged reproduction PR
means the claim was real, a closed one means it was not, and that is ground truth
nobody has to curate.

**Belongs:** scanner prompts and their pinned versions, reading observations,
refuting them against our telemetry, the digest.

**Does NOT belong:**

- Reproducing a defect — that is `scripts/probes/` (see its README for the
  0/1/3 exit contract) driven by `scripts/verify-ux-findings.mjs`.
- The triage workflow and its hard rules — `.agents/skills/replay-triage/`.
- The criteria themselves — `.agents/skills/replay-triage/references/review-protocol.md`
  is the definition; `server/scanners.ts` is the encoding.

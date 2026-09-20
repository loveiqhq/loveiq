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

**Score it from the LEDGER, not the fixtures.** `scripts/replay-bench/score.mjs
--ledger` reads what the probes actually concluded; the seven fixtures expire
2026-09-28 and cannot be re-scanned, because a scanner observes a given session
once ever. The weekly step ran the bare script until 2026-09-20, so every
scheduled score came from the seven rows about to die — and the gap is not
cosmetic: **0.02 precision on 84 ledger findings against 0.20 on the fixtures.**
The larger sample says the scanners are ten times worse than the number that was
being reported.

Below bar is a fact about the scanners, not a fault in the workflow, so exit 1
(below bar) and exit 2 (too few labels) do not fail the run. Exit 3 — a missing
secret, an unreadable ledger — does, because a score that could not be computed
must never read as a healthy one.

`human_label` is deliberately null until someone says: a merged reproduction PR
means the claim was real, a closed one means it was not, and that is ground truth
nobody has to curate.

**Champion vs challenger, because a prompt edit cannot be measured.** A scanner
observes a given session once, ever, so editing a live prompt is a silent no-op
on every recording already seen and the new wording can never be compared
against the old one on the same evidence. The only honest experiment is a second
scanner on the same trigger event.

The first one, created 2026-09-20: `LoveIQ report UX (challenger: observation
only)`. Its champion is **0 right, 38 wrong**, and 20 of those 38 are not near
misses — they are `contradicted`, claims our own events refute, where the
scanner named an unlock or checkout press that never happened. Prompt hardening
was already tried against exactly this: the champion ends with "Do not say which
control the user pressed unless the press and the change it caused are both
visible", and it produced the twenty anyway. So the challenger is not asked to
diagnose at all — it reports screen states and is forbidden from naming a
control or a motive. Causation is the probe's job.

Three rules keep the comparison honest, each with a test:

- **Same trigger event**, or the two are scored on different populations.
- **A challenger never reaches a Slack thread and never opens a pull request.**
  Its findings are probed and written to the ledger — it cannot be scored
  otherwise — and nothing more. Promotion is a deliberate edit to `role`.
- **One probe answers both.** When a champion and a challenger flag the same
  (session, criterion), the second inherits the first's outcome instead of being
  filed as a `duplicate`, which the ledger score EXCLUDES. Without that, the
  comparison would have measured which scanner happened to be fetched first.

Read the result with `node scripts/replay-bench/score.mjs --ledger`, which
prints the pair and breaks out `contradicted` — the number the experiment is
actually about. **What would falsify it:** if the challenger's `contradicted`
count is no lower than the champion's over the same sessions, the hypothesis is
wrong and the scanner should be deleted rather than tuned.

Order matters when enabling one: the suppression above must be LIVE before the
scanner is, or a trial prompt posts into a reader's thread.

**How this one ends, decided before the result is known** (2026-09-20), because
an experiment with no stopping rule becomes a scanner nobody remembers enabling:

|                        |                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sample**             | at least 30 labelled challenger findings, or four weeks, whichever first                                                                        |
| **Promote if**         | its `contradicted` rate is materially below the champion's AND its precision is no worse                                                        |
| **Delete if**          | `contradicted` is no lower — the hypothesis was wrong, and a wrong hypothesis is not tuned into a right one                                     |
| **Blocker either way** | it must cite a moment. It currently does not: 0 of its findings carry a timestamp against the champion's 67%, because it writes "At," and stops |

That last row is why promotion is not just a flag flip. The citation is what
makes a finding checkable by a human, and the challenger loses it — harmless
while its findings never reach anybody, disqualifying the moment they do.

**Do NOT fix that prompt on the running scanner.** An edit bumps
`scanner_version`, and a scanner observes a given session once ever, so the
170-session like-for-like comparison would be split across two prompts and stop
meaning anything. Fix it in a SECOND challenger, after this one has answered.

**First reading, 170 sessions seen by both and 0 by only one:** champion flagged
47 (28%), challenger 2 (1%); champion names a control the user pressed in 28 of
its 48 findings, challenger in 0 of 2. Directionally what was predicted, on a
sample far too small to act on — and a scanner that answered NO to everything
would look identical, which is exactly why the probes, not the flag rate,
decide.

**Belongs:** scanner prompts and their pinned versions, reading observations,
refuting them against our telemetry, the digest.

**Does NOT belong:**

- Reproducing a defect — that is `scripts/probes/` (see its README for the
  0/1/3 exit contract) driven by `scripts/verify-ux-findings.mjs`.
- The triage workflow and its hard rules — `.agents/skills/replay-triage/`.
- The criteria themselves — `.agents/skills/replay-triage/references/review-protocol.md`
  is the definition; `server/scanners.ts` is the encoding.

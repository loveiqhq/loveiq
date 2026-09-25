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
- `server/digest-audit.ts` — re-asks each claim of the last digest that was
  delivered, over its own 24 hours, from a source the digest did not use.
  Run daily at 08:53 UTC by `.github/workflows/ux-digest-audit.yml` through
  `scripts/audit-ux-digest.mjs`.

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
hourly schedule in CI. `app/api/cron/ux-review/route.ts` collects and posts
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

-- verdicts that were meant for a thread and found none, and which criteria keep
-- arriving uncheckable. A clear or a contradiction is never posted (#238), so a
-- bare NOT delivered counts every one of them as "reached nobody".
SELECT count(*) FILTER (WHERE NOT delivered AND (outcome = 'inconclusive'
         OR (outcome = 'gap' AND criterion IS NOT NULL))) AS undelivered,
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

**Most of that 0.02 was never measured.** A `clear` used to count as proof the
scanner was wrong, on the stated condition that the probe was mutation-proven.
That condition is necessary and not sufficient: `MUTATE=1` shows a probe detects
its OWN injected defect, not that it asked the question the finding asked. Of 27
probes exactly one — `verify-dead-click-target.mjs` — reads something the scanner
claimed (`URL_PATH` and `TARGET_SELECTOR`, from that session's own click event).
Every other probe opens the same canonical page and takes only the device list
from the finding, so its verdict is a constant with respect to the claim: the
same PASS comes back whoever raised it.

Measured on the 21 L1 report findings (2026-09-21): both L1 probes healthy, both
clean 19/19, neither able to have said anything else. Each probe run is now
stamped `claimScoped` in `probe_runs`, and a `clear` with none is reported as
**not counted** rather than held against the scanner — and not counted in its
favour either, because an unchecked claim is open, not won. The survey scanner
moves from 2/44 to 2/3 with 41 set aside; the report scanner stays at 0/22,
because all 22 of its wrong answers are `contradicted` by our own events, which
was always solid evidence. See `scripts/lib/claim-scoped-probes.mjs` for what
earns a probe a place in the set.

Below bar is a fact about the scanners, not a fault in the workflow, so exit 1
(below bar) and exit 2 (too few labels) do not fail the run. Exit 3 — a missing
secret, an unreadable ledger — does, because a score that could not be computed
must never read as a healthy one.

`human_label` is deliberately null until someone says: a merged reproduction PR
means the claim was real, a closed one means it was not, and that is ground truth
nobody has to curate. It outranks the probe everywhere it is read: the digest
reports a `disagree` as "ruled out when a person looked" rather than as a
confirmed problem, and the scorecard scores the scanner by it. A confirmation
the route replay made ALONE opens no PR and posts nothing (see
`confirmedByReplayAlone`), so nobody labels it by merging; whoever looks sets
`human_label` on the row by hand.

**One place applies the prompts, and it is main.** The daily cron ALERTS on
drift between PostHog and `scanners.ts` and nothing ever closed it —
`scripts/sync-vision-scanners.ts` existed and ran in no workflow, so every
correction was somebody noticing a Slack message and remembering the command.
The edge is sharper than a stale prompt: applying from a branch and applying
from main are the same command with different content, so whoever ran it last
wins. On 2026-09-21 a prompt improvement was pushed to PostHog from an unmerged
branch, production still pinned the old version, and the drift alert fired for a
change that was correct but not yet deployed. `.github/workflows/sync-vision-scanners.yml`
now applies it on push to main and fails if a second dry run still reports drift.
**Do not run `--apply` from a branch.**

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

**IT ENDED ON 2026-09-21, and the answer was not the one the rule anticipated.**

The hypothesis was right: forbidding the model from explaining WHY anything
happened stopped it inventing causes. On 197 recordings each — champion 43
findings with 22 invented, challenger 1 finding with 0 invented.

The challenger was retired anyway, and both reasons are worth keeping:

- **The win evaporated.** Those 22 mattered because each posted a note under a
  real person's submission saying our scanner had described something that never
  happened. Verdicts that are not reproductions are no longer posted at all, so
  the advantage was over a problem that stopped existing.
- **The stopping rule could not be met.** "30 findings or four weeks" was taken
  from the champion's flag rate and applied to a scanner whose whole hypothesis
  is flagging less — at 1% it needed about 300 days. Set the threshold from the
  behaviour you are testing, not from the thing you are testing it against.

**The open question, which no prompt answers:** neither scanner has ever been
right — 0 of 43 across 197 report recordings. Either there are no report defects
or our probes cannot see them, and telling those apart is where the next effort
belongs. The survey scanner holds the only 2 confirmed findings in the system.

The machinery stays: role, suppression, the shared probe outcome, the pairing in
the scorecard. The next experiment uses it, and the tests prove the rules
without needing one to be running.

**The digest has a probe too, since 2026-09-24.** Rendering the next morning's
digest from live data found four false things it would have said: a
confirmation a person had closed as wrong, "19 had no survey entry" when 9 had
none, and unwatched readers "not lost" when no survey or report scanner had ever
opened them, the week's worst sessions among them. Every one passed its tests.
`ux-digest-audit.yml` now re-asks those claims daily against the survey tables,
GitHub and PostHog: exit 1 fails the run and posts the disagreement to the
commits channel, exit 3 fails it without posting. It re-computes with today's
code over the digest's window, so it checks the logic the digest runs, not the
text Slack received; and it cannot see a posted reply inside its thread, since
the only Slack token CI holds can write but not read.

**The re-queue reads what PostHog did, since 2026-09-25.** PostHog keeps one
observation per (scanner, session) and `/observe/` does nothing once it exists,
even a failed one. For a week the re-queue printed "30 queued, 0 failed" while
39 readers sat behind temporary failures from 2026-09-18 ("Activity task timed
out", "Queries are a little too busy"). `requeueAction()` in
`scripts/lib/scanners-by-trigger.mjs` now reads the pair's latest observation:
never tried is observed, a temporary failure is retried through
`/observations/{id}/retry/`, a permanent one is printed and left alone. Only a
queue or a retry spends `MAX_ENQUEUE`. It also covers readers who LEFT: the
re-queue used to start from `survey_submission`, so it only saw finishers, while
PostHog's comprehensive sweep never tried 48 of 253 watchable survey sessions and 13
of 111 report sessions in a week. Every comprehensive scanner now gets the watchable
sessions its trigger matched (7 days, 10 s of activity, PostHog's own minimum) that it
never opened.

**The fix writer stays dispatch-only, decided 2026-09-21.**

`generate-fix.yml` has run 11 times, all by hand, and produced exactly one pull
request. That reads like a broken tool and is not: `prove-fix.mjs` rejected the
other ten because the fix did not survive being built and re-probed. A
generator whose output is accepted 9% of the time is behaving correctly, and
the right response to a 91% rejection rate is not to automate it — firing it at
every finding would turn that rate into a queue of pull requests nobody reads.

The one that was accepted deleted the assertion that would have caught it,
which is now a hard gate ("a fix may add assertions, never delete them"). Idle
cost is zero, so there is nothing to retire: a person decides a defect is worth
fixing, then asks for one.

**Belongs:** scanner prompts and their pinned versions, reading observations,
refuting them against our telemetry, the digest.

**Does NOT belong:**

- Reproducing a defect — that is `scripts/probes/` (see its README for the
  0/1/3 exit contract) driven by `scripts/verify-ux-findings.mjs`.
- The triage workflow and its hard rules — `.agents/skills/replay-triage/`.
- The criteria themselves — `.agents/skills/replay-triage/references/review-protocol.md`
  is the definition; `server/scanners.ts` is the encoding.

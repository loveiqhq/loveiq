# features/ux-review

**Purpose:** Turn PostHog Replay Vision verdicts about session recordings into
evidence, or refuse to. The scanners watch every survey, report, rage-click and
dead-click recording and emit a verdict; this feature decides what, if anything,
the team is told.

**Entry:**

- `server/scanners.ts` — the four scanner prompts, verbatim and in git, plus each
  scanner's id, trigger event, credit cap and pinned version. Pure data.
- `server/review.ts` — reads observations (`fetchFindings`), refuses claims our
  own events contradict (`contradiction`), builds the daily summary
  (`fetchDailyStats`, `buildDigestMessage`), and reports prompt drift
  (`detectDrift`).

**The one rule that shapes everything: a verdict is not a finding.**

Measured 2026-09-14 — 31 observations, 5 flagged, and the stated mechanism was
wrong in all five. Confidence sat at 0.8–1.0 across _both_ verdicts, so it
discriminates nothing and is never published. The benchmark
(`scripts/replay-bench/`) scores precision 0.25 against a 0.80 bar, which is the
number to quote.

Prompt hardening does not fix this and must not be the reflex: the v2 prompts
already carry the anti-inference rule and a HARD RULE against flagging taps on
ordinary text, and the model broke both. The gate has to sit outside the model.

So a finding earns a Slack post only by being **reproduced in a real browser at
the viewport the session reported** — `scripts/verify-ux-findings.mjs`, every
three hours in CI. `app/api/cron/ux-review/route.ts` collects and posts one
summary a day; it cannot open a browser, so it publishes no findings.

**Belongs:** scanner prompts and their pinned versions, reading observations,
refuting them against our telemetry, the digest.

**Does NOT belong:**

- Reproducing a defect — that is `scripts/probes/` (see its README for the
  0/1/3 exit contract) driven by `scripts/verify-ux-findings.mjs`.
- The triage workflow and its hard rules — `.agents/skills/replay-triage/`.
- The criteria themselves — `.agents/skills/replay-triage/references/review-protocol.md`
  is the definition; `server/scanners.ts` is the encoding.

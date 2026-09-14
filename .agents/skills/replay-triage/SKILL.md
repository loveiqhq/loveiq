---
name: replay-triage
description: Triage a PostHog Replay Vision finding into a verified fix. Use when a UX review lands in Slack, when asked to "check the replay findings", "triage this session", "why did the scanner flag this", or when reviewing session recordings for UX defects. Reproduces the claim against production before believing it, then opens a DRAFT PR.
metadata:
  author: loveiq
  version: "0.1.0"
---

# Replay Triage

A scanner watched a recording and said something looked wrong. It is a lead, not
a finding. Your job is to decide whether it is real, and if it is, to fix it and
prove the fix.

## Initial assessment

Read the observation: verdict, confidence, and the reasoning with its citations.

**Stop before you start** if any of these hold — file it, rate it 👎, and move on:

- verdict is not `yes`, or confidence is below 0.7
- the reasoning cites nothing you can point at in the recording
- the session was on `?v2=1` — that is report 2.0, which 0% of readers see
- the claim maps to no criterion in `references/review-protocol.md`. That is a
  scanner gap, not a product defect. Report it as a gap; do not invent a fix.

## The loop

1. **Classify** — which criterion id from `references/review-protocol.md`?
2. **Reproduce at the reader's own size** — run that criterion's named probe
   from `scripts/probes/` against production, on at least two engines (Chromium
   and WebKit), **at the viewport the session actually reported**. The verifier
   passes it as `WIDTHS`; `sessionViewport()` reads it from the recording.
   A defect reproduced on a default phone proves nothing about someone who hit
   it at 262px — the citation-URL overflow found on 2026-09-14 was invisible at
   every width our device matrix covered. If no probe covers the criterion,
   write one; `scripts/probes/README.md` is the trap list, read it first.
3. **Decide** — reproduced / not reproduced / artifact. **Not reproduced goes to
   a human, never to a PR.**
4. **Fix** — the root cause. Grep every caller before editing; a guard in the
   shared function beats a guard in one call site.
5. **Prove** — the probe must FAIL with `MUTATE=1` and PASS without it. No
   mutation mode means write one, or the fix is unproven.
6. **Ship** — branch `replay/<criterion>-<session8>`, run `npm run lint`,
   `npm test` and the probe, then `gh pr create --draft`. **Never merge.**
   Open the PR for every reproduced finding, from day one — the PR review is the
   human gate, not a rating in Slack. State in the body what was reproduced, on
   which devices, and what the probe does under `MUTATE=1`, so the reviewer can
   judge the diagnosis and not just the diff.
7. **Rate** — thumbs up (reproduced) or down (artifact) on the observation in
   PostHog. That rating is the human-in-the-loop record and becomes the next
   benchmark fixture for free.

## Hard rules

These were each paid for by a wrong answer already shipped. They are here rather
than in a reference file because an optional read is an ignored read.

1. **An inconclusive run is a FAILURE, never a pass.** It does not become a PR.
2. **No citation, no claim.** Reasoning without a moment you can point at is dropped.
3. **"A modal appeared" is not "my click opened it."** The report's scroll paywall
   opens by itself a second or two after scrolling stops. A probe that taps and
   then waits for a modal goes green with the handler under test suppressed — on
   all three devices. Assert the specific effect, or sit through a control window.
4. **A hidden element is usually still in the DOM.** The pricing dialog is
   permanently mounted. Assert `visibility`, opacity and height — never
   `!!querySelector`.
5. **Analytics can never confirm a probe.** Headless browsers and localhost are
   suppressed in PostHog by design. Proof is the probe's own assertion, never
   "the event stopped firing".
6. **`$dead_click` is a lead, not evidence.** PostHog's own `$dead_click`
   mislabels clicks that worked, and our `dead_click` never reaches Postgres, so
   it cannot be corroborated there.
7. **One device is luck.** A `::after` hit-area worked on Chromium and did
   nothing on WebKit; only a 25-point lattice caught it.
8. **`locator.click()` is not a tap**, and a point on an element is not
   necessarily tappable — sticky chrome covers the bottom ~90px. Scan for a point
   whose `elementFromPoint` belongs to the target.
9. **Verify your edit landed.** Several probe string-replacements silently
   matched nothing after Prettier rewrapped the lines, and the "fixed" probe
   reran unchanged — twice looking like an app defect.
10. **Check which report version you are looking at.** `features/report/AGENT_README.md`:
    `ui/v1/` is what every reader gets; `ui/sections/` is `?v2=1`. A fix in the
    wrong copy reaches nobody — see `reportVersionParity.test.ts`.

## Output format

One block per observation:

```
<session id> · <criterion> · verdict <yes|no> (<confidence>)
reproduced: yes|no|artifact   probe: <file> (MUTATE: pass|fail)
action: <PR url> | human review: <reason>
```

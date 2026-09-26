# Device probes

Playwright probes that drive the real site with a real finger. They exist
because the defects they found were invisible to the type checker, to the unit
suite, and to `locator.click()` — every one of them needed an actual touch at an
actual coordinate on an actual page.

Run them against production unless you have a reason not to:

```bash
REPORT_ORIGIN=https://www.loveiq.org node scripts/probes/verify-tap-targets.mjs
DEVICE="iPhone SE" node scripts/probes/audit-paywall-layout.mjs
```

## Exit codes are the contract

`scripts/verify-ux-findings.mjs` decides whether a Slack finding is real by
running a probe and reading its **exit code**. Three values, and the difference
between 1 and 3 matters:

| code | meaning                                                 | what the verifier does                  |
| ---- | ------------------------------------------------------- | --------------------------------------- |
| `0`  | clean — the defect is not present                       | posts "could not reproduce"             |
| `1`  | the defect REPRODUCED                                   | posts a finding                         |
| `3`  | INCONCLUSIVE — the probe never reached what it measures | posts "could not check — needs a human" |

Two failures this encodes, both found on 2026-09-14:

**A probe that always exits 0 cannot report anything.** Eleven of the probes
printed `PASS`/`FAIL` to stdout and exited 0 regardless. Four of them backed
criteria in the verifier (`P1`, `Z1`, `S1`, `E1`), so those criteria were
structurally incapable of producing a finding no matter what the product did.
`P1`, `Z1` and `S1` now exit on their verdict, and every criterion has a probe —
including `A1`, which `audit-paywall-layout.mjs` gained when it started exiting
on legible text under an overlay rather than only printing the blur.

**All fifteen gate probes use the three-way contract** (verified 2026-09-17; it
was two). Six of them exited `1` when they could not reach the site at all,
which `verify-ux-findings.mjs` reads as "the defect reproduced" — so a timeout
or a refused connection produced a finding about a page that never loaded, and
two of the six backed criteria that open a draft PR. The stdout backstop does
not cover it: a Playwright failure says `net::ERR_CONNECTION_REFUSED`, matching
neither `INCONCLUSIVE` nor `exception:`.

`scripts/verify-probe-falsifiability.mjs --contract-only` points every gate
probe at `http://localhost:1` and requires exit 3 from each. A refused
connection is instant, so the whole corpus checks in about five seconds, and
`probe-guard.yml` runs it daily.

**A probe must answer about the surface the claim is on.** `L1` matched both
"a valid report offers a survey restart" and "the survey looped back to its
start", and only the first had a probe. Six findings in twelve hours were
handed to `verify-no-survey-restart.mjs`, which loads `/report/<token>` and
never visits the survey, so it returned clean on every device and the verifier
posted "loop back to an earlier screen (L1) passes in production now" into six
readers' threads. A probe answering about a surface it never visited is worse
than no probe. `verify-survey-loop.mjs` covers the other half, and it exits 1
on production today.

**Inconclusive is not reproduced.** Collapsing 3 into 1 lets a broken probe
manufacture a stream of confident findings — the exact failure the gate exists
to prevent. `verify-input-zoom.mjs` returned exit 3 on every device for its
whole life: it asked for question **37**, the age question, which has no text
input, and it set only the localStorage answers blob while `loadInitialStep()`
also needs the sessionStorage step, so the engine never mounted. The country
search is index **35**. Had it exited 1 instead, every `Z1` observation would
have read "confirmed in production".

An inconclusive run is still never a pass (rule 5 below). It just is not proof
of a defect either.

## The harness

| File                 | What it is                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `touch.mjs`          | Real touch scrolling via CDP `Input.synthesizeScrollGesture`. **WebKit has no CDP and no `mouse.wheel`**, so it falls back — a probe that scrolls with `window.scrollBy` is not testing touch and will pass while a finger fails. |
| `staging-cookie.mjs` | A locally built server has `STAGING_PASSWORD` set, so every route is gated. Without this a probe silently measures the login page.                                                                                                |
| `supa.mjs`           | Minimal PostgREST client. Credentials are read from `.env.local` **at runtime** — never embedded, so nothing secret can be committed or pasted into a transcript.                                                                 |

## What each probe pins

| File                                  | The defect it caught                                                                                                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `replay-session.mjs`                  | Follows THIS reader's recorded route — their scrolls, drawer, paywall taps — on a device matched to their screen, checking after every step that the page still scrolls, nothing threw and no overlay covers the text. |
| `verify-tap-targets.mjs`              | A 34px CTA, below the 44px minimum.                                                                                                                                                                                    |
| `verify-paywall-closes.mjs`           | Whether ONE tap on ✕ dismisses the paywall and it stays dismissed.                                                                                                                                                     |
| `audit-paywall-layout.mjs`            | White gap before each paywall, and legible text under an overlay meant to hide it (A1). Exits 0/1/3.                                                                                                                   |
| `verify-inapp-browsers.mjs`           | Instagram / TikTok / Facebook WebViews: UA, the shorter viewport, sticky unlock, prices, checkout POST. Exits 0/1/3, `MUTATE=1`; runs daily in probe-guard.                                                            |
| `verify-reaches-bottom.mjs`           | Whether a finger can actually reach the end of the report.                                                                                                                                                             |
| `device-matrix.mjs`                   | The full locked-report → paywall → checkout walk across every phone.                                                                                                                                                   |
| `verify-checkout-error-copy.mjs`      | Whether a raw internal error string ever reaches a reader mid-checkout (E1).                                                                                                                                           |
| `verify-consent-return.mjs`           | "Return to site" on the 18+ screen goes to the site, and keeps the answers (B1).                                                                                                                                       |
| `verify-narrow-viewport.mjs`          | Nothing overflows at 262–320px — the widths real foldables reported (C1).                                                                                                                                              |
| `verify-nav-heading-clearance.mjs`    | The fixed chapter bar never covers the report's first heading (C1); on desktop, at the reader's own width, since the bar shows below 1280px.                                                                           |
| `verify-no-survey-restart.mjs`        | A VALID report token never offers "take the survey" as the way forward (L1/B1).                                                                                                                                        |
| `verify-paywall-card-tap.mjs`         | Tapping the paywall card body — not just its button — opens pricing (D1).                                                                                                                                              |
| `verify-locked-preview-tap.mjs`       | Tapping a blurred locked preview opens that chapter's paywall (D1).                                                                                                                                                    |
| `verify-input-zoom.mjs`               | iOS auto-zoom from an input under 16px (Z1).                                                                                                                                                                           |
| `verify-stage-carousel-swipe.mjs`     | A real finger drag moves the stage carousel.                                                                                                                                                                           |
| `audit-visual.mjs`                    | Overflow, unpainted images, scroll-locked overflow (M1). Exits 0/1/3 — no longer a print-only audit.                                                                                                                   |
| `console-audit.mjs`                   | Every console error and failed request, unfiltered. The one that really does always exit 0, which is why no criterion lists it.                                                                                        |
| `verify-consent-banner-clearance.mjs` | The 316px consent banner made the survey's Continue button unreachable at ANY scroll on 3 of 4 phones (V1/C1).                                                                                                         |
| `verify-dead-click-target.mjs`        | Whether the element this reader actually tapped is a dead control, read from the session's own `dead_click` event (D1/V1).                                                                                             |
| `verify-cta-visibility.mjs`           | The primary CTA is in the first viewport, reachable by a real tap, and at least 44px (V1).                                                                                                                             |
| `verify-survey-loop.mjs`              | Finishing the survey and pressing Back lands the reader on the intro screen with progress reset (L1). The first defect this pipeline ever reproduced.                                                                  |

## Replaying a route, and the two traps in it

`replay-session.mjs` exists because every other probe drives a path we chose.
That is why the report scanner can sit at 0 confirmed in 45 with every probe
clean: a defect that only appears part way through one reader's sequence is
structurally invisible to a probe that never performs that sequence.

Two things nearly made it useless, both found by running it:

- **"The tap did not reach the element" is the wrong test.** A recorded dead
  tap mostly names a CONTAINER, because a disabled control is
  `pointer-events: none` and the browser reports whatever sits behind it. The
  first version reported 14 findings on one session, every one of them
  `div.flex`, `p` or `strong` — a finger resting on prose. The question that
  means something is the one the product's own detector asks: is a DISABLED
  control under that point?
- **Present in the DOM is not open.** Both dialogs on the report page are
  always in the document — `.report-pricing-modal__dialog` at
  `visibility: hidden`, and CookieYes leaves its container visible after
  Accept. A lock is only a fault when nothing is open, so a presence test
  suppressed every check in the run, and `MUTATE=1` passed while painting its
  own scroll lock. Read the modal ROOT, and require a real box.

Coverage is part of the verdict: a run that could only follow part of the
route exits 3. Route steps and recorded dead taps are counted separately,
because a selector naming content that is not on our report says nothing about
the page's health — folding them together dragged coverage from 90% to 52%.

**It comes back from a checkout it started.** Checkout is stubbed as disabled,
so pressing a reader's Unlock leaves the page's own status layer up
(`.report-checkout-handoff`, "Back to your report"). Judged as covering the
page, that was the replay's second false confirmation (2026-09-25). It now
presses the layer's button, as the reader did on coming back from Stripe; a
layer that never offers one is still reported.

**It cannot speak alone yet.** A finding confirmed by the replay and nothing
else is recorded as reproduced and named in the daily digest, but it is not
posted under the reader and opens no pull request until a person has looked.
Its record when that was decided (2026-09-24): 16 runs, 15 clean, and the one
solo confirmation was wrong (#282). Lift the hold in `confirmedByReplayAlone`
once it has been right.

## Lessons paid for already — don't relearn them

- **Wait for content, not for the spinner.** Sampling mid-load reported healthy
  pages as broken on every device.
- **`/api/report` rate-limits ~8/min per IP.** Concurrency produces 429s that
  look exactly like dead pages.
- **A tap that works navigates away.** Where the tap is not the thing under
  test, hit-test instead of tapping.
- **Hit-test ownership is `el === n || n.contains(el)`.** The reverse counts
  ancestors and inflates a 34px control to "61px tappable".
- **An inconclusive run is a FAILURE, never a pass.** One probe here always
  exits 0 by design (`console-audit`): it is an audit and must not be cited as
  a gate. Everything else reports `INCONCLUSIVE` (exit 3) rather than staying
  silent. On 2026-09-24 eight probes that ran from nowhere were deleted after a
  production run: three were duplicated by wired probes, three could no longer
  reach their subject (two of those still exited 0), one crashed without
  `.env.local`, and the storage one had rotted into failing with storage
  WORKING — it is now an end-to-end test (`e2e/survey-questions.spec.ts`).
- **One probe point passes by luck.** Use a lattice: a `::after` hit-area worked
  on Chromium and did nothing on WebKit, and only a 25-point grid caught it.
- **Headless browsers are suppressed in PostHog by design**, and localhost is
  filtered too — so a probe can never verify itself through analytics.
- **Verifying against production writes real data**: telemetry rows, and live
  Stripe sessions. Clean up after yourself.
- **A hidden element is usually still in the DOM.** The pricing modal keeps ONE
  permanently-mounted dialog node, hidden via `visibility` and opacity. Probes
  built on `!!querySelector(...)` therefore read "open" forever — one reported
  "would not stay shut" on all three devices while the app closed correctly every
  time. Assert what a reader can see: `visibility`, opacity and height.
- **`locator.click()` is not a tap.** It bypasses hit-testing and can drive a
  hidden duplicate of the control, so the probe believes it clicked and the app
  never moved. Tap coordinates.
- **Don't assume a point on an element is tappable.** On a short viewport the
  sticky chapter-pill nav sits on top of the paywall card, and a fixed offset
  tapped the nav instead — reported as the app being broken. Scan for a point
  whose `elementFromPoint` really belongs to the target.
- **An open modal scroll-locks the body.** A `scrollIntoView` issued before that
  lock releases silently does nothing; the card stayed off screen about one run
  in two. Retry the scroll rather than failing.
- **Verify that an edit to a probe actually applied.** Several string
  replacements here silently matched nothing after Prettier rewrapped the lines,
  and the "fixed" probe reran unchanged — twice looking like an app defect.
- **Every probe needs a mutation mode.** `MUTATE=1` on the paywall-card probe
  suppresses the handler under test; all devices must fail under it. A probe
  that cannot fail proves nothing.
- **"A modal appeared" is not "my click opened it."** The report's scroll
  paywall opens by itself a second or two after scrolling stops, so a probe that
  taps and then waits for a modal goes GREEN with the handler under test
  suppressed — this one did, on all three devices. Assert the specific effect
  (here: the chapter's CTA received a click), or sit through a control window
  first and prove the modal stays shut.
- **Most locked previews are covered by their own paywall card**, so
  `elementFromPoint` returns the overlay and the probe finds nothing tappable.
  The previews this matters for are the exposed ones; scroll and hit-test every
  preview until one is genuinely reachable.
- **Sticky chrome covers the bottom of whatever you aim at.** The sticky unlock
  bar sits over the lower ~90px of the viewport, so a drag aimed at a card's
  centre moved the CTA bar and nothing else — read as "swiping is broken" on a
  carousel that swipes fine. Scan for a point whose `elementFromPoint` belongs
  to the target before gesturing at it.
- **`scroll-behavior: smooth` makes a synchronous control read lie.** Assigning
  `el.scrollLeft += 300` and reading it back in the same tick returns the OLD
  value, because the animation has not started. It looked like the element could
  not scroll at all. Wait, then read.
- **A scroll step bigger than the viewport can jump clean over the target.** A
  620px step on an iPhone 15 Pro (659px tall) leapt over a 421px carousel and
  ran to the bottom of a 34,725px page, reporting "never reached" for an element
  that was present the whole time. Scroll to the element, or step smaller than
  the viewport.
- **Narrow "is this element a defect" rules to the shape of the defect.** A
  restart-CTA probe that matched any `a[href^="/survey"]` flagged the grey
  footer nav link at the bottom of an 80,000px page and failed on a perfectly
  healthy report. The real defect is a restart offered as THE way forward — a
  status card or a `.report-button` — so scope to that and footer navigation is
  excluded by construction.
- **A string replacement into a prettier-formatted file fails silently, and it
  will happen to you more than once.** Three edits in one session matched nothing
  because Prettier had rewrapped the target across lines; each time the "fixed"
  file ran unchanged and looked like a product bug. Assert the anchor, patch by
  LINE NUMBER when the target is inside formatted code, and grep for the new text
  before running anything.
- **Render at the size the reader had, not at a device you own.** Our matrix
  started at 320px; 3% of sessions are narrower, the narrowest observed was
  262px (a Galaxy Z Flip whose viewport moved 262-715px as it folded), and the
  citation URLs overflowing by 123px had therefore never been rendered by
  anything we run. `verify-ux-findings.mjs` now passes the session's real
  `WIDTHS` to the probe.
- **An inline element's `getBoundingClientRect()` lies when the text wraps.** It
  returns the union of the line boxes, which spans the whole column, so an
  overflow check counted 142 false positives. Judge inlines by their individual
  `getClientRects()`; keep the simple rect for block elements.

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
printed `PASS`/`FAIL` to stdout and exited 0 regardless. Four of them back
criteria in the verifier (`P1`, `Z1`, `S1`, `E1`), so those criteria were
structurally incapable of producing a finding no matter what the product did.

**Inconclusive is not reproduced.** Collapsing 3 into 1 lets a broken probe
manufacture a stream of confident findings — the exact failure the gate exists
to prevent. `verify-input-zoom.mjs` had been landing on the consent screen and
never measuring an input at all; had it exited 1, every `Z1` observation would
have been "confirmed in production".

An inconclusive run is still never a pass (rule 5 below). It just is not proof
of a defect either.

## The harness

| File                 | What it is                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `touch.mjs`          | Real touch scrolling via CDP `Input.synthesizeScrollGesture`. **WebKit has no CDP and no `mouse.wheel`**, so it falls back — a probe that scrolls with `window.scrollBy` is not testing touch and will pass while a finger fails. |
| `staging-cookie.mjs` | A locally built server has `STAGING_PASSWORD` set, so every route is gated. Without this a probe silently measures the login page.                                                                                                |
| `supa.mjs`           | Minimal PostgREST client. Credentials are read from `.env.local` **at runtime** — never embedded, so nothing secret can be committed or pasted into a transcript.                                                                 |

## What each probe pins

| File                            | The defect it caught                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify-consent-fix.mjs`        | The cookie banner (316px, z-index 9999999) covered the bottom-pinned unlock CTA. 0/6 devices could tap it.                                    |
| `verify-tap-targets.mjs`        | A 34px CTA, below the 44px minimum.                                                                                                           |
| `verify-deadzone-opens.mjs`     | Locked blocks that swallowed taps instead of opening the paywall.                                                                             |
| `verify-map-row.mjs`            | Tapping the Insight Map row's TEXT did nothing — 97 dead clicks. Taps the text well clear of the pill and requires the modal.                 |
| `verify-practice-info.mjs`      | The practice-table ⓘ opened a note that could not be closed.                                                                                  |
| `verify-paywall-closes.mjs`     | Whether ONE tap on ✕ dismisses the paywall and it stays dismissed.                                                                            |
| `audit-paywall-layout.mjs`      | Measures the white gap before each paywall and any legible text under an overlay, on three viewports.                                         |
| `verify-price-exposure-row.mjs` | Asserts the durable `analytics_event` row, not the client event — the client half was never broken, so asserting on it would pass either way. |
| `verify-survey-no-storage.mjs`  | Safari private mode / in-app WebViews that THROW on every storage access.                                                                     |
| `verify-inapp-browsers.mjs`     | Instagram / Facebook WebViews.                                                                                                                |
| `verify-reaches-bottom.mjs`     | Whether a finger can actually reach the end of the report.                                                                                    |
| `device-matrix.mjs`             | The full locked-report → paywall → checkout walk across every phone.                                                                          |
| `console-audit.mjs`             | Every console error and failed request, unfiltered.                                                                                           |

## Lessons paid for already — don't relearn them

- **Wait for content, not for the spinner.** Sampling mid-load reported healthy
  pages as broken on every device.
- **`/api/report` rate-limits ~8/min per IP.** Concurrency produces 429s that
  look exactly like dead pages.
- **A tap that works navigates away.** Where the tap is not the thing under
  test, hit-test instead of tapping.
- **Hit-test ownership is `el === n || n.contains(el)`.** The reverse counts
  ancestors and inflates a 34px control to "61px tappable".
- **An inconclusive run is a FAILURE, never a pass.** Every probe here reports
  `INCONCLUSIVE` rather than staying silent.
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

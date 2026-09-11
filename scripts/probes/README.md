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

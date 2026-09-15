# UX review protocol

The criteria the Replay Vision scanners apply, and how to check each one against
the product. Agreed requirement (Marcus, 2026-09-11): these must be **explicitly
defined** rather than left to the model's judgement, and **benchmarked** before
anyone trusts them.

The prompts that encode these live in `features/ux-review/server/scanners.ts`.
That file is the source of truth. `features/ux-review/tests/scanners.test.ts`
pins **three** of the ten rows below (`E1`'s error string, `L1`'s "LOOP",
`S1`'s "EXCESSIVE SCROLLING"); the other seven could be deleted from a prompt
with CI green. Nothing in the repo reads this document. See Known gaps.

| id   | Trigger and threshold                                                                                                                                                          | How to verify in the product                                                                 | Already covered by                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `E1` | **Error text** visible for at least one frame — notably the literal `"Unable to process request."` returned by ~10 API routes, or any failure state where content was expected | `console-audit.mjs` on the route, then reproduce the flow                                    | gap — console-audit only, no test                                                              |
| `L1` | **Loop**: the same control activated 3+ times in 10s with no state change, or a CTA that lands the user back at the survey start                                               | tap by coordinate and assert the _specific_ effect, never "something appeared"               | `verify-deadzone-opens`, `verify-map-row`, `verify-paywall-card-tap`                           |
| `D1` | **Dead control**: pointerdown on a `cursor:pointer` / `role=button` element, no DOM or navigation change within 2s, twice or more                                              | hit-test lattice; ownership is `el === n \|\| n.contains(el)`                                | `verify-tap-targets`, `verify-locked-preview-tap`, `verify-featured-card`                      |
| `Z1` | **Viewport zoom**: ratio ≠ 1.00 ±0.01 after focusing a control. The iOS signature is 16/15 = 1.067                                                                             | measure `visualViewport.scale` **and** the control's computed `font-size`                    | `input-font-size-ios-zoom.test.ts`, `verify-input-zoom.mjs` — the exemplar row                 |
| `S1` | **Unproductive scroll**: 3+ direction reversals over one 1.5-viewport band within 20s                                                                                          | replay with real touch via `touch.mjs`, never `window.scrollBy`                              | `verify-reaches-bottom.mjs`                                                                    |
| `C1` | **Clipped or occluded**: ≥8px of a heading under fixed chrome, or a tap point owned by another element                                                                         | `getBoundingClientRect` against the fixed bar, plus `elementFromPoint`                       | `verify-nav-heading-clearance` (MUTATE), `verify-consent-fix`, `reportLayoutStandards.test.ts` |
| `V1` | **Primary CTA not immediately usable**: the main call to action is outside the first viewport, covered at its centre point, or under 44px tall                                 | `verify-cta-visibility.mjs` — in-viewport, `elementFromPoint` ownership, tap-target height   | `verify-cta-visibility.mjs`                                                                    |
| `B1` | **Backwards navigation**: a CTA lands the user below the highest step they reached, with no back tap. Any single occurrence                                                    | new probe                                                                                    | `verify-consent-return.mjs`, `verify-no-survey-restart.mjs`                                    |
| `M1` | **Missing content**: a `REPORT_SECTION_ORDER` id whose anchor is absent, or an `<img>` that never paints                                                                       | assert against `features/report/ui/reportNav.ts`                                             | `reportSectionOrder.test.ts`, `reportVersionParity.test.ts`                                    |
| `P1` | **Recurring modal**: the same dialog visible again within 30s of a dismiss, twice or more                                                                                      | **visibility-based**: `visibility !== hidden && opacity > 0.05 && height > 20`               | `verify-paywall-closes`, `verify-practice-info`                                                |
| `A1` | **Illegible overlay**: text readable through a blur meant to hide it, or text under 18px below 4.5:1 contrast                                                                  | `audit-paywall-layout.mjs` already measures legible text under an overlay on three viewports | `audit-paywall-layout.mjs`; contrast notes in `.claude/agents/accessibility-reviewer.md`       |

## Reproduce at the size the reader had

Every row above is checked at the viewport the session reported, not at a
default device. `sessionViewport()` returns the narrowest and widest width seen
in the recording — narrowest because that is where layout breaks, both because a
foldable moves mid-session (one real finding ranged 262px to 715px as a Galaxy Z
Flip opened).

This is not theoretical. 3% of sessions in the 30 days to 2026-09-14 were under
348px, the narrowest was 262px, and our device matrix started at 320px — so the
citation URLs overflowing the viewport by 123px had never been rendered by
anything we run. A "could not reproduce" from the wrong size is worse than no
answer, because it closes the question.

## Two notes that matter more than the table

**Thresholds must match the instrumentation.** `L1`'s "3 activations" is the same
number as `RAGE_THRESHOLD = 3` / `RAGE_WINDOW_MS = 1000` in
`shared/observability/uxSignals.ts`. If one moves, both move — otherwise the
scanner and the product disagree about what a loop is.

**`S1` has no safe absolute threshold.** The report is legitimately ~34,700px
tall, so any distance-based scroll rule is almost all false positives. Reversals
over the same band only.

## What "correct" is measured against

Not a new design doc — these already exist and are machine-readable:

- `features/report/ui/reportNav.ts` — `REPORT_SECTION_ORDER`, `REPORT_NAV_PARTS`
- `app/globals.css` `:root` — `#0b0613`, `#f26d4f`, `#9c7dff`, `--report-lock-blur: 4px`
- `features/report/ui/report.css` — `.report-chapter-pill`, fixed at `safe-area + 80px`, z-index 39
- `features/report/AGENT_README.md` — **v1 is what 100% of readers see**; 2.0 is `?v2=1`

## Known gaps

A criterion the scanner can raise but nobody can verify is a criterion that will
eventually be believed without evidence. Listed rather than quietly omitted:

- **`E1` is covered where it can actually reach a reader.** The literal
  `"Unable to process request."` is returned by ~30 routes, but that count is
  misleading: traced on 2026-09-14, only ONE path ever rendered it to a user.
  `startReportCheckout` passed `json.error` through into the handoff card, which
  is what Mark saw on a €39.99 purchase. Everywhere else it is unreachable —
  the report captures the message but renders status-code copy instead, the
  survey never parses the body on failure, contact and share-verify write their
  own reader-facing 5xx strings, and the tracking beacons, cron and admin routes
  are not read by a customer. `verify-checkout-error-copy.mjs` guards the one
  path that mattered. `console-audit.mjs` is deliberately NOT listed as an E1
  probe: it asserts nothing and always exits 0, so it could only ever produce a
  false all-clear.
- **`A1` and `M1` now have one** (added 2026-09-14). `audit-paywall-layout.mjs`
  exits on legible text under an overlay meant to hide it; `audit-visual.mjs`
  exits on images present but never painted — the half of `M1` Mark reported
  twice. Both previously printed their measurement and exited 0, which is why
  they had been listed as covering criteria they could not actually gate. The
  superseded note read:

  **`A1` and `M1` are recognised but have no probe.** The verifier now
  classifies ten criteria, so a claim of either is named and routed to a human
  instead of falling through to nobody — but neither runs a probe. `A1`'s
  `audit-paywall-layout.mjs` measures the blur and always exits 0, so listing it
  would print "could not reproduce — passes in production now" for every A1
  claim. **A false all-clear is worse than no probe**, which is why the entry is
  deliberately empty until that audit becomes a gate.

- **`B1` is now covered** by `verify-consent-return.mjs` and
  `verify-no-survey-restart.mjs`, after it first fired for real on 2026-09-14.

Corrected 2026-09-14: this file claimed `features/ux-review/tests/scanners.test.ts`
"fails CI if a criterion below disappears from a prompt". It asserts three of
the ten rows (`E1`'s literal, `L1`'s "LOOP", `S1`'s "EXCESSIVE SCROLLING") and
nothing in the repo reads this document, so seven rows could be deleted from a
prompt with CI green.

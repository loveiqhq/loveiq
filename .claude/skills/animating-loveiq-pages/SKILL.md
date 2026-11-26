---
name: animating-loveiq-pages
description: Use when adding or changing an entrance, scroll animation, fly-in, cascade, count-up, cross-out or hover motion on a loveiq.org page or component (landing pages, pay-to-start, report, survey), or when a design, board or reviewer asks for something to "fly in", "roll up" or "animate".
---

# Animating LoveIQ pages

## Overview

LoveIQ's motion is a library, not taste. Hana's Animation chapter in the design system decides
what moves, how far, for how long and on which curve. Take every value from there, or from the
page's own animated board: never from the nearest component in the code.

## Where the values come from

1. **The page's own board**, if its designer animated it. It wins for that page only. Landing
   page v2: Marcus's canvas `VEMrYPSudVHZ4HtF2D5wj5`, boards "Hero 3 · animated pain-point
   section".
2. **Otherwise the design system LoIQ 9.26** (`https://claude.ai/artifact/X2nsY26v98zqbi6S2NruWu`):
   `project/Animation.md` (principles, one style per use, a pairing guide), `project/tokens.json`
   → `animation`, and the components' READMEs (`Reveal`, `FadeUp`, `SlideIn`, `Stagger`,
   `CountUp`, `StrokeReveal`). Read them with the Artifact tool: `list` with `scope: "files"`,
   then `read` with `paths`. Plan mode refuses the read.

| Token                              | Value                       | Used for                                                  |
| ---------------------------------- | --------------------------- | --------------------------------------------------------- |
| `duration-reveal`                  | 700ms                       | a block's fade-up, a slide-in, each item of a cascade     |
| `distance-rise` / `distance-slide` | 24px / 40px                 | fade-up and cascades / slide-ins                          |
| `stagger-step`                     | 80ms                        | between items: six at most, the whole cascade under 600ms |
| `duration-count`                   | 1600ms                      | count-ups (research stats only), from 40% in view         |
| `duration-draw`                    | 1200ms                      | drawn lines, filling bars                                 |
| `ease-out`                         | `cubic-bezier(.16,1,.3,1)`  | everything that enters or responds                        |
| `ease-in-out`                      | `cubic-bezier(.65,0,.35,1)` | drawing, connectors                                       |
| `distance-lift`                    | 2px buttons, 4px cards      | hover                                                     |

## The rules (Animation.md)

- Content enters once. Nothing replays when scrolled back to.
- Never animate a price, a checkout or pay button, a status line, the logo, the payment logos,
  paywalled text or a question being answered. No countdowns, nothing that urges.
- Under reduced motion and without JavaScript, every element is at its end state at once.
- Animate `transform` and `opacity` only (plus `background-size` or `stroke-dashoffset` to draw).

## In the code

| Need                  | Use                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A block fades up      | `.animate-on-scroll` (and `.stagger-1…5`), played by `features/landing/ui/ScrollAnimator.tsx`, mounted once per page                    |
| A row cascades as one | `data-reveal` on the row; the children's CSS keys on `.animate` and an index variable (`.pp-card-in` and `--pp-i` in `app/globals.css`) |
| A number rolls up     | `features/landing/ui/CountUpOnView.tsx`                                                                                                 |
| Report, survey sheets | `features/report/ui/v3/useV4Reveal.ts` and `useV4CountUp.ts`; `CountUpPercent` in `features/survey/ui/sheets/parts.tsx`                 |

Every new entrance class gets its end state in **both** `@media (prefers-reduced-motion: reduce)`
and `@media (scripting: none)`, at the same specificity as its start state. A scoped start rule
(`.pp-root .x.animate-on-scroll`) outranks the page's general fallbacks. Pin both with a test
that reads the real `@media` blocks (`features/landing/tests/painPointMotion.test.tsx`).

## Common mistakes

| Mistake                                            | Fix                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Values copied from a neighbouring component        | The board's, or the tokens above                                                                                                      |
| Reveal class on a client component that re-renders | React drops `.animate`: put it on a static wrapper                                                                                    |
| Entrance and hover lift on one element             | Entrance on the wrapper, lift on the card inside it                                                                                   |
| A high threshold on a tall group                   | A small phone may never reach it: trigger per element or row, and stagger only where items share a row (set the index per breakpoint) |
| An entrance inside a horizontal scroller           | It clips vertically: pad the row for lifts and shadows                                                                                |
| Text faded to a light grey                         | Keep 4.5:1 at rest; the a11y scan fails below it                                                                                      |
| A heading animated word by word                    | Accessible names drop the spaces: add an `sr-only` copy and `aria-hidden` the animated words                                          |
| A count-up that renders 0                          | Render the final value and let JavaScript zero it: no-JS readers, search engines and the reduced-motion baselines see the number      |

## Testing

- Unit: stub `IntersectionObserver` so it reports nothing after `disconnect()`, and fake
  `requestAnimationFrame` and `performance` with vitest's timers.
- e2e: scroll 60% of a screen at a time and poll until what is in view has played (WebKit's
  observer reports every 100–200ms); check every end state under `reducedMotion: "reduce"`.
- The visual baselines run under reduced motion, so they show end states only.

## Telling Mark

Give each changed motion as numbers, before → now: duration, delay, distance.

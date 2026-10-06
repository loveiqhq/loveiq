# features/landing

**Purpose:** The marketing landing page (`/`) — plus shared chrome (footer, scroll animator) reused by other routes. The page is `ui/white/` (rebuilt 2026-08-10), and its hero is in a 50/50 A/B (round 3): arm A (`white_card`) keeps question 1 in the hero, arm B (`white_video`) shows the presenter video (`ui/white/WHeroVideo.tsx`) in that slot, and every other section is shared. Round 2 — `ui/white/` against `ui/white-v1/`, the white landing that preceded it — settled on `white/` (2026-09-19); `white-v1/` is kept for `?variant=white_prev`. Round 1 — white vs the original dark landing — concluded in favour of white (2026-06-19) and the dark `S##` sections + `LandingPage.tsx` were deleted. `S06Archetypes.tsx` is kept (both pages import its `ArchetypeCard`/`archetypes`; called without a `variant` it renders the pre-rebuild card style, which is what `white-v1` wants).

**A/B mechanics:** `proxy.ts` `resolveLandingVariant()` sends bots to `white` (arm A's page, but no arm), honours `?variant=`, keeps a returning visitor's live arm from the sticky `__liq_lv` cookie (an earlier round's value is re-rolled), and otherwise flips a coin; `app/page.tsx` reads the `x-landing-variant` request header and renders the page — `white_prev` → `LandingPageWhiteV1`, anything else → `LandingPageWhite`, which gives the hero the video for `white_video`. `shared/experiments/landingVariant.ts` owns the types, the live arms, the experiment id, the launch day the readouts start from and the downstream attribution notes. `white-v1/` pins only the four sections the rebuild redesigned (hero, archetype carousel, FAQ, closing CTA) and imports the other eleven from `white/`.

**Hero video (arm B):** `WHeroVideo` shows a poster, rolls a muted 7.5-second preview while it is on screen, and plays the full video (`public/videos/white/`, 1:10, captions burned in) with sound on a tap; a start that fails (a rejection, a media error, or no frame within 12 s) brings the button back. It is imported statically, not with `next/dynamic`: that wrapper has no Suspense boundary, so arm B's whole page waited on the video's chunk to hydrate. Its play, progress, completion and error events are in `features/analytics/client`.

**Entry points:**

- `ui/white/LandingPageWhite.tsx` — composition root for both live arms; renders each `white/W*.tsx` section in order, wrapped in `ScrollAnimator`.
- `ui/white/WHero.tsx` — the hero; its right-hand slot holds question 1 (arm A) or `WHeroVideo` (arm B).
- `ui/white-v1/LandingPageWhiteV1.tsx` — round 2's retired arm (the pre-rebuild landing).
- `ui/white/WNavSection.tsx` — white landing top nav.
- `ui/FooterSection.tsx` — site footer (reused by legal pages, glossary, trust-zone, report, about, 404).
- `ui/NavSection.tsx` — dark nav, now only used by the 404 page (`features/not-found`).
- `ui/ScrollAnimator.tsx` — IntersectionObserver-based fade-in orchestrator.
- `ui/LandingPageTracker.tsx` — analytics pageview tracker for `/`.

**Belongs here:**

- White landing section components `white/W*.tsx` rendered by `LandingPageWhite`.
- Cross-page chrome (footer, nav) that the landing owns and other pages consume.
- Scroll/animation orchestration scoped to the landing experience.
- Tests for the above in `tests/`.

**Does NOT belong here:**

- Survey UI → `features/survey/ui/`
- Report UI → `features/report/ui/`
- Generic React primitives or brand marks → `shared/ui/branding/` (kept central — used by both landing and other surfaces).
- Anything fetching server data (landing is static content + analytics).

**Related:**

- `shared/ui/branding/LoveIQBrand` — imported by `NavSection` and `FooterSection`.
- `features/analytics/client` — `trackStartSurvey`, `trackLandingPageView`, `trackHeroVideoPlay` / `Progress` / `Complete` / `Error`.

**Conventions:**

- White sections are prefixed `W` (e.g. `WHero`, `WFAQ`); render order is the order they appear in `LandingPageWhite.tsx`.
- Animations use `animate-on-scroll` class; the `ScrollAnimator` adds `.animate` when visible.
- Mobile breakpoint for the nav: `sm=640px` (hamburger) / `lg=1024px` (full nav).

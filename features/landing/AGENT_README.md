# features/landing

**Purpose:** The marketing landing page (`/`) — plus shared chrome (footer, scroll animator) reused by other routes. Two arms are live in a 50/50 A/B: `ui/white/` (the current design, rebuilt 2026-08-10) and `ui/white-v1/` (the white landing that preceded it). Round 1 — white vs the original dark landing — concluded in favour of white (2026-06-19) and the dark `S##` sections + `LandingPage.tsx` were deleted. `S06Archetypes.tsx` is kept (both arms import its `ArchetypeCard`/`archetypes`; called without a `variant` it renders the pre-rebuild card style, which is what `white-v1` wants).

**A/B mechanics:** `proxy.ts` `resolveLandingVariant()` flips a coin, pins bots to the current arm, honours `?variant=`, and mints the sticky `__liq_lv` cookie; `app/page.tsx` reads the `x-landing-variant` request header and renders the arm. `shared/experiments/landingVariant.ts` owns the types and the downstream attribution notes. `white-v1/` pins only the four sections the rebuild redesigned (hero, archetype carousel, FAQ, closing CTA) and imports the other eleven from `white/`, so fixes land on both arms.

**Entry points:**

- `ui/white/LandingPageWhite.tsx` — arm A composition root; renders each `white/W*.tsx` section in order, wrapped in `ScrollAnimator`.
- `ui/white-v1/LandingPageWhiteV1.tsx` — arm B composition root (the pre-rebuild landing).
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
- `features/analytics/client` — `trackStartSurvey`, `trackLandingPageView`.

**Conventions:**

- White sections are prefixed `W` (e.g. `WHero`, `WFAQ`); render order is the order they appear in `LandingPageWhite.tsx`.
- Animations use `animate-on-scroll` class; the `ScrollAnimator` adds `.animate` when visible.
- Mobile breakpoint for the nav: `sm=640px` (hamburger) / `lg=1024px` (full nav).

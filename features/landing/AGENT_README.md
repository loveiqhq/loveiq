# features/landing

**Purpose:** Marketing landing page sections (S01-S15), top NavSection, and shared FooterSection. The `/` route renders these.

**Entry points:**

- `ui/LandingPage.tsx` — composition root; imports each `S##*.tsx` section in order and wraps in `ScrollAnimator`.
- `ui/NavSection.tsx` — top nav (reused by legal pages, glossary, trust-zone, report, about, 404 via `@features/landing/ui/NavSection`).
- `ui/FooterSection.tsx` — site footer (same reuse pattern).
- `ui/ScrollAnimator.tsx` — IntersectionObserver-based fade-in orchestrator.
- `ui/LandingPageTracker.tsx` — analytics pageview tracker for `/`.

**Belongs here:**

- Numbered section components `S##*.tsx` rendered by `LandingPage`.
- Cross-page chrome (nav, footer) that the landing page owns and other pages consume.
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

- Sections are numbered (`S01`–`S15`) to encode render order in filenames. Gaps (S04, S11) are intentional historical removals.
- Animations use `animate-on-scroll` class; the `ScrollAnimator` adds `.animate` when visible.
- Mobile breakpoint for the nav: `sm=640px` (hamburger) / `lg=1024px` (full nav).

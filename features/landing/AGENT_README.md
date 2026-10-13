# features/landing

**Purpose:** The marketing landing page (`/`) — plus shared chrome (footer, scroll animator) reused by other routes. The page is `ui/white/` (rebuilt 2026-08-10), and its hero is in a 50/50 A/B (round 3): arm A (`white_card`) keeps question 1 in the hero, arm B (`white_video`) shows the presenter video (`ui/white/WHeroVideo.tsx`) in that slot, and every other section is shared. Round 2 — `ui/white/` against `ui/white-v1/`, the white landing that preceded it — settled on `white/` (2026-09-19); `white-v1/` is kept for `?variant=white_prev`. Round 1 — white vs the original dark landing — concluded in favour of white (2026-06-19) and the dark `S##` sections + `LandingPage.tsx` were deleted. `S06Archetypes.tsx` is kept (both pages import its `ArchetypeCard`/`archetypes`; called without a `variant` it renders the pre-rebuild card style, which is what `white-v1` wants).

**A/B mechanics:** `proxy.ts` `resolveLandingVariant()` sends bots to `white` (arm A's page, but no arm), honours `?variant=`, keeps a returning visitor's live arm from the sticky `__liq_lv` cookie (an earlier round's value is re-rolled), and otherwise flips a coin; `app/page.tsx` reads the `x-landing-variant` request header and renders the page — `white_prev` → `LandingPageWhiteV1`, anything else → `LandingPageWhite`, which gives the hero the video for `white_video`. `shared/experiments/landingVariant.ts` owns the types, the live arms, the experiment id, the launch day, the day the readouts restart from (`LANDING_TEST_START_DAY`, the condensed phone hero) and the downstream attribution notes. `white-v1/` pins only the four sections the rebuild redesigned (hero, archetype carousel, FAQ, closing CTA) and imports the other eleven from `white/`.

**Hero video (arm B):** `WHeroVideo` shows a poster, rolls a muted 7.5-second preview while it is on screen, and plays the full video (`public/videos/white/`, 1:10, captions burned in) with sound on a tap; a start that fails (a rejection, a media error, or no frame within 12 s) brings the button back. It is imported statically, not with `next/dynamic`: that wrapper has no Suspense boundary, so arm B's whole page waited on the video's chunk to hydrate. Its play, progress, completion and error events are in `features/analytics/client`.

**Phone hero (below lg, both arms, since 12.10):** Marcus's condensed frame (Figma Report-3.0 `1604:5505`) puts the slot right under the hero's button, so the video or question 1 is on the first screen: 20px under the nav, the headline, the paragraph as one run (no break after "research."), the button, then the slot (question 1 40px under the button, the video 28px, as the frame's group `1637:616` draws it). The rating row, the "taking the test right now" ticker and the privacy line follow the slot there (groups `1637:625/648/643`, laid over the frame on the section); from lg they sit under the button. `WHero` renders them twice, one copy per breakpoint (`HeroProof`). `e2e/landing-hero-video.spec.ts` pins the slot under the button and the rows under the slot in both arms.

**Copy (both arms, since the 12.10 review):** Figma Report-3.0 `1604:8233` is the source of truth for the page's copy (Marcus, Slack 12.10). Its resolved comments took "free" out of every button (the hero's "Start my test now"; "Start test now", "Start the test", "Continue test", "Start test" further down), tag the findings "Included", and removed the hero's eyebrow, Vocab's "Say this instead" card, the insight-map label and the fourth locked row in `WFindOut`, the "Your result", "Field reports", "THE FOUNDATION" and "FAQ" eyebrows, the rail's "HOW YOUR RESULT IS DERIVED" label and the FAQ's contact line. Headings that lost an eyebrow keep their own top margin, as the frame does. `features/landing/tests/landingCopy1210.test.tsx` pins the buttons' names, their visible words and the removals for both arms.

**What the page records (both arms, PostHog; GA4 too with analytics consent):** `landing_page_view` and `experiment_exposure` (`LandingPageTracker`); `cta_click` from every call to action, by `location`, with `element: "question_card"` when it is a card's Continue rather than the button beside it; `cta_seen` once per page for `hero_card`, `hero_video` (half in view) and `sticky_bar` (when it slides in); `landing_card_answer` for a tap on question 1's scale on a card (`location`, `changed`), never the answer, which is special-category data; `section_seen` once per section per page when part of it reaches the top half of the screen (`LandingSectionsSeen`, `data-landing-section` on each section's root, the hero aside); `faq_expanded`; the video's play, pause, resume, progress, completion and error events. Every other click reaches PostHog through autocapture. `features/landing/tests/landingTracking.test.tsx` pins the new ones.

**Entry points:**

- `ui/white/LandingPageWhite.tsx` — composition root for both live arms; renders each `white/W*.tsx` section in order, wrapped in `ScrollAnimator`.
- `ui/white/WHero.tsx` — the hero; its right-hand slot holds question 1 (arm A) or `WHeroVideo` (arm B), and below lg sits right under the button.
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

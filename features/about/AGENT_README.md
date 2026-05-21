# features/about

**Purpose:** `/about` page — team, mission, publications, contact form section.

**Entry:** `ui/AboutPage.tsx` — composition root, referenced by `app/about/page.tsx`.

**Belongs:** about-page sections (`HeroSection`, `ChallengeVisionSection`, `SolutionSection`, `ProcessSection`, `PublicationsSection`, `TeamSection`, `ContactSection`), `AboutNavSection` (about-only nav variant).

**Does NOT belong:** landing-page chrome (use `@features/landing/ui/`), contact form server logic (use `app/api/contact/route.ts`).

# features/contact

**Purpose:** `/contact` form pipeline — reCAPTCHA → CSRF → rate-limit → Zod validate → Resend email → Slack.

**Entry:** API route still inline at `app/api/contact/route.ts`. Tests in `tests/`.

**Belongs:** contact form server logic + validation tests.

**Does NOT belong:** about-page contact section UI (that's `features/about/ui/ContactSection`).

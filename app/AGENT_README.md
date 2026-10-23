# app/

Next.js App Router directory containing all pages and API routes.

## Key Conventions

- Pages are thin wrappers that import their content from `features/<feature>/ui/`. Keep business logic and UI out of `app/` files.
- All new API routes must include CSRF verification, rate limiting, and Zod validation. Use `app/api/contact/route.ts` as the canonical reference.
- Legal pages follow a flat structure: `app/{legal-slug}/page.tsx`.

## Page Route Map

| Route                    | File                             | Component                                        |
| ------------------------ | -------------------------------- | ------------------------------------------------ |
| `/`                      | `page.tsx`                       | `features/landing/ui/white/LandingPageWhite.tsx` |
| `/about`                 | `about/page.tsx`                 | `features/about/ui/AboutPage.tsx`                |
| `/survey`                | `survey/page.tsx`                | `features/survey/ui/SurveyPage.tsx`              |
| `/glossary`              | `glossary/page.tsx`              | `features/glossary/ui/GlossaryPage.tsx`          |
| `/glossary/[slug]`       | `glossary/[slug]/page.tsx`       | `features/glossary/ui/GlossaryTermPage.tsx`      |
| `/trust-zone`            | `trust-zone/page.tsx`            | `features/trust-zone/ui/TrustZonePage.tsx`       |
| `/login`                 | `login/page.tsx`                 | `features/staging/ui/StagingLoginForm.tsx`       |
| `/admin/ap`              | `admin/ap/page.tsx`              | `features/admin/ui/ap/ApFocus.tsx`               |
| `/admin/login`           | `admin/login/page.tsx`           | `features/admin/ui/AdminLoginForm.tsx`           |
| `/privacy-policy`        | `privacy-policy/page.tsx`        | Inline legal content                             |
| `/terms-of-use`          | `terms-of-use/page.tsx`          | Inline legal content                             |
| `/terms-and-conditions`  | `terms-and-conditions/page.tsx`  | Inline legal content                             |
| `/medical-disclaimer`    | `medical-disclaimer/page.tsx`    | Inline legal content                             |
| `/digital-content-terms` | `digital-content-terms/page.tsx` | Inline legal content                             |
| `/cookies`               | `cookies/page.tsx`               | Inline legal content                             |
| `/imprint`               | `imprint/page.tsx`               | Inline legal content                             |

The admin is AP-Analytics only since 16 Oct 2026: `/admin` and the old admin pages redirect to `/admin/ap`. Use [`app/admin/AGENT_README.md`](admin/AGENT_README.md) for all nine AP pages. Use [`app/api/admin/AGENT_README.md`](api/admin/AGENT_README.md) for the admin API surface.

## API Route Map

| Endpoint                      | Method(s)        | File                                  | Purpose                     |
| ----------------------------- | ---------------- | ------------------------------------- | --------------------------- |
| `/api/contact`                | POST             | `api/contact/route.ts`                | Contact form                |
| `/api/survey`                 | POST             | `api/survey/route.ts`                 | Survey submission + scoring |
| `/api/survey-tracking`        | POST             | `api/survey-tracking/route.ts`        | Survey behavioral analytics |
| `/api/health`                 | GET              | `api/health/route.ts`                 | Health check                |
| `/api/staging-login`          | POST             | `api/staging-login/route.ts`          | Staging environment auth    |
| `/api/staging-logout`         | POST             | `api/staging-logout/route.ts`         | Staging environment auth    |
| `/api/admin/login`            | POST             | `api/admin/login/route.ts`            | Admin magic link login      |
| `/api/admin/logout`           | POST             | `api/admin/logout/route.ts`           | Admin logout                |
| `/api/admin/submissions/[id]` | GET/PATCH/DELETE | `api/admin/submissions/[id]/route.ts` | One submission (API only)   |

## Special Files

| File                           | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `layout.tsx`                   | Root layout (fonts, scripts, metadata, Schema.org JSON-LD) |
| `globals.css`                  | CSS custom properties, Tailwind base, animations           |
| `sitemap.ts`                   | Dynamic sitemap.xml generation                             |
| `robots.ts`                    | robots.txt generation                                      |
| `error.tsx`                    | Error boundary page                                        |
| `global-error.tsx`             | Root error boundary                                        |
| `admin/layout.tsx`             | Sets the signed-in admin's PostHog identity (no chrome)    |
| `admin/auth/callback/route.ts` | Magic link callback handler                                |

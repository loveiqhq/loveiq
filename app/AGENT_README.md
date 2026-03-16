# app/

Next.js App Router directory containing all pages and API routes.

## Key Conventions

- Pages are thin wrappers that import their content from `components/<page-name>/`. Keep business logic and UI out of `app/` files.
- All new API routes must include CSRF verification, rate limiting, and Zod validation. Use `app/api/waitlist/route.ts` as the canonical reference.
- Legal pages follow a flat structure: `app/{legal-slug}/page.tsx`.

## Page Route Map

| Route                     | File                              | Component                                  |
| ------------------------- | --------------------------------- | ------------------------------------------ |
| `/`                       | `page.tsx`                        | `components/landing/LandingPage.tsx`       |
| `/about`                  | `about/page.tsx`                  | `components/about/AboutPage.tsx`           |
| `/waitlist`               | `waitlist/page.tsx`               | `components/waitlist/WaitlistPage.tsx`     |
| `/survey`                 | `survey/page.tsx`                 | `components/survey/SurveyPage.tsx`         |
| `/glossary`               | `glossary/page.tsx`               | `components/glossary/GlossaryPage.tsx`     |
| `/glossary/[slug]`        | `glossary/[slug]/page.tsx`        | `components/glossary/GlossaryTermPage.tsx` |
| `/trust-zone`             | `trust-zone/page.tsx`             | `components/trust-zone/TrustZonePage.tsx`  |
| `/login`                  | `login/page.tsx`                  | `components/staging/StagingLoginForm.tsx`  |
| `/admin`                  | `admin/page.tsx`                  | `components/admin/AdminDashboard.tsx`      |
| `/admin/login`            | `admin/login/page.tsx`            | `components/admin/AdminLoginForm.tsx`      |
| `/admin/submissions`      | `admin/submissions/page.tsx`      | `components/admin/SubmissionBrowser.tsx`   |
| `/admin/submissions/[id]` | `admin/submissions/[id]/page.tsx` | `components/admin/SubmissionDetail.tsx`    |
| `/admin/survey-status`    | `admin/survey-status/page.tsx`    | `components/admin/SurveyStatus.tsx`        |
| `/privacy-policy`         | `privacy-policy/page.tsx`         | Inline legal content                       |
| `/terms-of-use`           | `terms-of-use/page.tsx`           | Inline legal content                       |
| `/terms-and-conditions`   | `terms-and-conditions/page.tsx`   | Inline legal content                       |
| `/medical-disclaimer`     | `medical-disclaimer/page.tsx`     | Inline legal content                       |
| `/digital-content-terms`  | `digital-content-terms/page.tsx`  | Inline legal content                       |
| `/cookies`                | `cookies/page.tsx`                | Inline legal content                       |
| `/imprint`                | `imprint/page.tsx`                | Inline legal content                       |

## API Route Map

| Endpoint                      | Method(s)        | File                                  | Purpose                     |
| ----------------------------- | ---------------- | ------------------------------------- | --------------------------- |
| `/api/waitlist`               | POST             | `api/waitlist/route.ts`               | Waitlist signup             |
| `/api/contact`                | POST             | `api/contact/route.ts`                | Contact form                |
| `/api/survey`                 | POST             | `api/survey/route.ts`                 | Survey submission + scoring |
| `/api/survey-tracking`        | POST             | `api/survey-tracking/route.ts`        | Survey behavioral analytics |
| `/api/health`                 | GET              | `api/health/route.ts`                 | Health check                |
| `/api/staging-login`          | POST             | `api/staging-login/route.ts`          | Staging environment auth    |
| `/api/staging-logout`         | POST             | `api/staging-logout/route.ts`         | Staging environment auth    |
| `/api/admin/login`            | POST             | `api/admin/login/route.ts`            | Admin magic link login      |
| `/api/admin/logout`           | POST             | `api/admin/logout/route.ts`           | Admin logout                |
| `/api/admin/stats`            | GET              | `api/admin/stats/route.ts`            | Dashboard analytics         |
| `/api/admin/submissions`      | GET              | `api/admin/submissions/route.ts`      | Submission list (paginated) |
| `/api/admin/submissions/[id]` | GET/PATCH/DELETE | `api/admin/submissions/[id]/route.ts` | Submission CRUD             |
| `/api/admin/export`           | GET              | `api/admin/export/route.ts`           | CSV export                  |
| `/api/admin/survey-status`    | GET/PATCH        | `api/admin/survey-status/route.ts`    | Survey active/closed toggle |

## Special Files

| File                           | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `layout.tsx`                   | Root layout (fonts, scripts, metadata, Schema.org JSON-LD) |
| `globals.css`                  | CSS custom properties, Tailwind base, animations           |
| `sitemap.ts`                   | Dynamic sitemap.xml generation                             |
| `robots.ts`                    | robots.txt generation                                      |
| `error.tsx`                    | Error boundary page                                        |
| `global-error.tsx`             | Root error boundary                                        |
| `admin/layout.tsx`             | Admin shell (sidebar + header, auth gate)                  |
| `admin/auth/callback/route.ts` | Magic link callback handler                                |

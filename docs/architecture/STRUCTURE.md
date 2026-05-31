# Codebase Structure

> **Last verified:** 2026-05-31 | **Verified against:** full directory listing of `app/`, `features/`, `shared/`, `data/`, `scripts/`, `supabase/`, `docs/`

## Directory Layout

```text
loveiq-web/
├── app/                        # Next.js App Router: pages + API routes (thin wrappers)
│   ├── api/                    # API route handlers (route.ts per endpoint)
│   │   ├── contact/route.ts    # Contact form endpoint
│   │   ├── survey/route.ts     # Survey submission endpoint
│   │   ├── survey-partial/route.ts   # Partial survey save (draft)
│   │   ├── survey-tracking/route.ts  # Survey behavior tracking
│   │   ├── invite/route.ts           # Invite email sending
│   │   ├── invite-tracking/route.ts  # Invite share method tracking
│   │   ├── analytics-event/route.ts  # Report-engagement events
│   │   ├── health/route.ts           # Health check endpoint
│   │   ├── staging-login/route.ts    # Staging auth
│   │   ├── stripe/webhook/route.ts   # Stripe webhook fulfillment
│   │   ├── resend/webhook/route.ts   # Resend (email) webhook
│   │   ├── cron/                      # Scheduled jobs (Bearer CRON_SECRET)
│   │   └── admin/                     # Admin panel API routes
│   ├── admin/                  # Admin panel pages (Supabase Auth protected)
│   ├── report/                 # Paywalled personalized report (/report/[token])
│   ├── about/ survey/ glossary/ trust-zone/ login/   # Public pages
│   ├── [legal pages]/          # privacy-policy, terms-*, cookies, imprint, etc.
│   ├── globals.css layout.tsx page.tsx robots.ts sitemap.ts error.tsx global-error.tsx
├── features/                   # Domain-first feature folders (ui/, server/ or logic/, tests/, AGENT_README.md)
│   ├── about/ landing/ glossary/ legal/ trust-zone/ not-found/   # ui/-only marketing surfaces
│   ├── survey/                 # ui/ (engine, hooks, questions), server/ (handler, emails), tests/
│   ├── report/                 # ui/, server/ (access, gating, emails/nurture), tests/
│   ├── checkout/               # ui/, server/ (stripeCheckout, fulfillment, promoCodes)
│   ├── pricing/                # logic/ (reportPricing) only
│   ├── scoring/                # logic/ (engine, config, types, index), tests/
│   ├── invite/                 # ui/, emails/, tests/
│   ├── contact/                # tests/ (route stays in app/api/contact/)
│   ├── cron/                   # tests/ (routes stay in app/api/cron/)
│   ├── analytics/              # client.ts (GA4 helpers) + tests/
│   └── admin/                  # ui/ (dashboards), server/ (data assembly + emails), tests/
├── shared/                     # Cross-cutting infrastructure
│   ├── http/                   # csrf, csrf-client, ratelimit, fetch-with-timeout, circuit-breaker, after-response
│   ├── observability/          # logger (pino), hotjar, slack, uxSignals
│   ├── auth/                   # supabase-middleware (admin sessions only)
│   ├── url/                    # utm, safe-href, share-message, signed-image-url
│   ├── format/                 # html-escape
│   ├── emails/                 # ab-variant, shared HTML shell, suppression, unsubscribe-token, site-url
│   ├── experiments/            # client A/B buckets (forced paywall)
│   ├── flags/                  # system feature flags
│   └── ui/                     # branding/, GtmScript, HydrationMarker, NonceProvider, SmoothScroll, UtmCapture, WebVitals
├── data/                       # Static + generated data
│   ├── glossary-data.ts / glossary-source.csv
│   ├── survey-data.ts / survey-source.csv
│   ├── scoring-config.ts / scoring-config/ (source CSVs)
│   ├── report-*.ts             # Generated report content
│   ├── countries.ts product-kpis.ts product-kpis/
├── docs/                       # Engineering documentation
│   ├── architecture/           # ARCHITECTURE, STRUCTURE, STACK, CONVENTIONS, INTEGRATIONS, TESTING, CONCERNS, AGENTS
│   ├── runbooks/               # DEVELOPMENT, SECURITY, SECURITY_AUDIT, DISASTER_RECOVERY, MIGRATION_ROLLBACK
│   ├── compliance/             # DPIA, LAWFUL_BASIS, ROPA
│   ├── admin/                  # admin lookup router + domains/*.md
│   ├── adr/                    # Architecture Decision Records
│   ├── plans/                  # Historical implementation handoffs
│   ├── api.md admin-api.md admin-dashboard.md survey.md versions.md
│   └── doc-inventory.md knowledge-ledger.md
├── __tests__/                  # Cross-cutting unit/contract/integration tests (Vitest)
├── e2e/                        # End-to-end tests (Playwright)
├── load-tests/                 # k6 load tests
├── scripts/                    # Build/data/maintenance scripts
├── supabase/                   # migrations/, config, ROLLBACK.md
├── public/                     # Static assets (images, icons, videos)
├── .github/workflows/          # CI/CD: ci, security, codeql, docs-truth, release, health-monitor, lighthouse, load-test, slack-commits, visual-regression
├── proxy.ts                    # Middleware: CSP headers, CSRF cookies, security logging
├── package.json tsconfig.json tailwind.config.js postcss.config.js eslint.config.mjs
├── vitest.config.ts vitest.integration.config.ts playwright.config.ts next.config.js
├── .env.example CLAUDE.md CONTRIBUTING.md README.md FILE_INDEX.md
```

## Directory Purposes

**app/**

- Purpose: Next.js App Router — pages and API routes
- Contains: thin page wrappers (`.tsx`) that import UI from `features/*/ui/`, API handlers (`route.ts`), metadata
- Key files: `layout.tsx` (root layout), `page.tsx` (home), `globals.css`

**features/**

- Purpose: domain-first feature folders. Each owns its UI, server/logic, tests, and an `AGENT_README.md`
- Layout: `features/<feature>/ui/` (React components), `features/<feature>/server/` or `logic/` (server-only code), `features/<feature>/tests/`
- Example: `features/survey/ui/SurveyEngine.tsx`, `features/survey/server/server.ts`, `features/scoring/logic/engine.ts`

**shared/**

- Purpose: cross-cutting infrastructure imported via the `@shared/*` alias
- Subdirectories: `http/`, `observability/`, `auth/`, `url/`, `format/`, `emails/`, `experiments/`, `flags/`, `ui/`
- Key files: `shared/http/csrf.ts`, `shared/http/ratelimit.ts`, `shared/observability/logger.ts`

**data/**

- Purpose: static + generated data (glossary, survey, scoring config, report content, product KPIs)
- Generated files (`*-data.ts`, `scoring-config.ts`, `report-*.ts`) are produced by `scripts/` — do not hand-edit

**`__tests__/`**

- Purpose: cross-cutting unit/contract/integration tests. Feature/module tests are colocated under `features/*/tests/` and `shared/*/tests/`

**e2e/**

- Purpose: end-to-end tests (Playwright), 5 browser projects

**public/**

- Purpose: static assets served at root URL (`/images/...`)

## Key File Locations

**Entry Points:**

- `app/layout.tsx` — root layout with fonts, scripts, metadata
- `app/page.tsx` — landing page entry (renders `features/landing/ui/LandingPage.tsx`)

**Configuration:**

- `tsconfig.json` — TypeScript compiler options (path aliases: `@/*`, `@shared/*`, `@features/*`)
- `next.config.js`, `tailwind.config.js`, `postcss.config.js`, `eslint.config.mjs`
- `vitest.config.ts`, `playwright.config.ts`

**Core Logic:**

- `app/api/contact/route.ts`, `app/api/survey/route.ts` — form handlers
- `features/analytics/client.ts` — analytics event tracking
- `shared/http/csrf.ts` — CSRF token verification
- `shared/http/ratelimit.ts` — Supabase-backed rate limiting
- `features/invite/emails/invite.ts` — email template
- `proxy.ts` — middleware (CSP, CSRF cookies, security logging)

**Documentation:**

- `CLAUDE.md` — Claude Code instructions
- `docs/runbooks/SECURITY.md` — security guidelines and secrets rotation
- `docs/runbooks/DEVELOPMENT.md` — development setup guide
- `CONTRIBUTING.md` — contributing guidelines
- `docs/api.md` — API endpoint documentation

## Naming Conventions

**Files:**

- `PascalCase.tsx` — React components (e.g., `S01Hero.tsx`, `LandingPage.tsx`)
- `camelCase.ts` — utility/library files (e.g., `client.ts`, `ratelimit.ts`)
- `kebab-case` — directories (e.g., `app/api/contact/`)
- `route.ts` — Next.js API route handlers

**Directories:**

- Lowercase/kebab-case for all directories
- Page directories match URL path (e.g., `about/` → `/about`)
- Feature directories named by domain (`survey/`, `report/`, `admin/`) with `ui/` + `server/`/`logic/`

**Special Patterns:**

- `page.tsx` — Next.js page component (required for routes)
- `layout.tsx` — Next.js layout component
- `route.ts` — Next.js API route handler
- `S##Name.tsx` — numbered landing sections (e.g., `S01Hero.tsx` through `S15Testimonials.tsx`)

## Where to Add New Code

**New Page:**

- Create `app/{page-name}/page.tsx`
- Add page UI under `features/{feature}/ui/` and create `{PageName}Page.tsx` as main composition

**New Landing Section:**

- Add component to `features/landing/ui/`
- Follow naming: `S##Name.tsx`
- Import and add to `features/landing/ui/LandingPage.tsx`

**New API Endpoint:**

- Create `app/api/{endpoint}/route.ts`
- Export `POST`, `GET`, etc. functions
- Include CSRF verification (`verifyCsrfToken`) and rate limiting (`checkRateLimit`)
- Add a Zod schema for validation

**New Cross-Cutting Utility:**

- Add to the relevant `shared/<area>/` directory and import via `@shared/...`
- Feature-specific server code goes in `features/<feature>/server/`

**New Email Template:**

- Feature-owned templates go in `features/<feature>/server/emails/` (or `features/invite/emails/`)
- Shared helpers (shell, A/B, suppression) live in `shared/emails/`

---

_Last updated: 2026-05-31_
_Update when directory structure changes_

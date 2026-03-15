# Codebase Structure

> **Last verified:** 2026-03-15 | **Verified against:** full directory listing of app/, components/, lib/, data/, scripts/

**Analysis Date:** 2025-01-14

## Directory Layout

```
loveiq-web/
├── app/                        # Next.js App Router pages and API routes
│   ├── api/                    # API route handlers
│   │   ├── contact/route.ts    # Contact form endpoint
│   │   ├── waitlist/route.ts   # Waitlist signup endpoint
│   │   ├── survey/route.ts     # Survey submission endpoint
│   │   ├── health/route.ts     # Health check endpoint
│   │   ├── staging-login/route.ts   # Staging auth (staging only)
│   │   ├── staging-logout/route.ts  # Staging auth (staging only)
│   │   ├── survey-tracking/route.ts # Survey behavior tracking
│   │   └── admin/                   # Admin panel API routes
│   │       ├── login/route.ts       # Admin magic link login trigger
│   │       ├── logout/route.ts      # Admin logout
│   │       ├── stats/route.ts       # Dashboard analytics
│   │       ├── submissions/route.ts # Submission list (paginated)
│   │       ├── submissions/[id]/route.ts # Submission CRUD
│   │       ├── export/route.ts      # CSV export
│   │       └── survey-status/route.ts # Survey active/closed toggle
│   ├── admin/                  # Admin panel pages (Supabase Auth protected)
│   │   ├── layout.tsx           # Admin shell (sidebar + header)
│   │   ├── login/page.tsx       # Admin magic link login page
│   │   ├── page.tsx             # Dashboard
│   │   ├── submissions/page.tsx # Submission browser
│   │   ├── submissions/[id]/page.tsx # Submission detail
│   │   ├── survey-status/page.tsx   # Survey status toggle
│   │   └── auth/
│   │       └── callback/route.ts    # Supabase Auth magic link callback
│   ├── about/                  # About page
│   ├── waitlist/               # Waitlist standalone page
│   ├── survey/                 # Survey / intro wizard page
│   ├── glossary/               # Glossary pages (index + [slug])
│   ├── trust-zone/             # Trust zone page
│   ├── login/                  # Staging login page
│   ├── privacy-policy/         # Legal: Privacy policy
│   ├── terms-of-use/           # Legal: Terms of use
│   ├── terms-and-conditions/   # Legal: Terms and conditions
│   ├── medical-disclaimer/     # Legal: Medical disclaimer
│   ├── digital-content-terms/  # Legal: Digital content terms
│   ├── cookies/                # Legal: Cookies policy
│   ├── imprint/                # Legal: Imprint
│   ├── globals.css             # Global styles, CSS variables, animations
│   ├── layout.tsx              # Root layout (fonts, scripts, metadata)
│   ├── page.tsx                # Landing page (home)
│   ├── robots.ts               # robots.txt generation
│   └── sitemap.ts              # sitemap.xml generation
├── components/                 # React components organized by page
│   ├── landing/                # Landing page sections
│   │   ├── LandingPage.tsx     # Main composition component
│   │   ├── NavSection.tsx      # Navigation
│   │   ├── S01Hero.tsx         # Hero section
│   │   ├── S02HowItWorks.tsx   # How it works
│   │   ├── S03PerfectFor.tsx   # Perfect for
│   │   ├── S04TrustedBy.tsx    # Trusted by
│   │   ├── S05ValueFeatures.tsx # Value features
│   │   ├── S06Archetypes.tsx   # Archetypes
│   │   ├── S07SampleProfile.tsx # Sample profile
│   │   ├── S08AcademicBoard.tsx # Academic board
│   │   ├── S09Report.tsx       # Report
│   │   ├── S10Pillars.tsx      # Pillars
│   │   ├── S11Testimonials.tsx # Testimonials
│   │   ├── S12WhyWeCreated.tsx # Why we created
│   │   ├── S13FAQ.tsx          # FAQ
│   │   ├── S14CTA.tsx          # Final CTA
│   │   ├── FooterSection.tsx   # Footer
│   │   └── ScrollAnimator.tsx  # Scroll animation orchestrator
│   ├── about/                  # About page sections
│   ├── glossary/               # Glossary components
│   ├── legal/                  # Legal page nav component
│   ├── survey/                 # Survey / intro wizard components
│   ├── admin/                  # Admin panel components
│   │   ├── AdminLoginForm.tsx  # Admin magic link login form
│   │   ├── AdminSidebar.tsx    # Sidebar navigation
│   │   ├── AdminHeader.tsx     # Mobile header with hamburger
│   │   ├── AdminDashboard.tsx  # Dashboard with stats + charts
│   │   ├── SubmissionBrowser.tsx # Filterable submission list
│   │   ├── SubmissionDetail.tsx # Single submission view + actions
│   │   ├── SurveyStatus.tsx    # Survey active/closed toggle
│   │   └── hooks/useAdminFetch.ts # Generic data fetching hook
│   └── SmoothScroll.tsx        # Lenis smooth scroll wrapper
├── lib/                        # Utilities and helpers
│   ├── analytics.ts            # GA4 event tracking helpers
│   ├── csrf.ts                 # CSRF token verification (double-submit cookie)
│   ├── ratelimit.ts            # IP-based rate limiting (Supabase-backed)
│   ├── circuit-breaker.ts      # Circuit breaker pattern
│   ├── logger.ts               # pino structured logging
│   ├── fetch-with-timeout.ts   # Fetch wrapper with timeout
│   ├── admin/                  # Admin panel utilities
│   │   ├── auth.ts             # Admin session verification
│   │   ├── audit.ts            # Admin action audit logging
│   │   ├── client.ts           # Supabase client factory
│   │   ├── roles.ts            # Role-based access control
│   │   ├── supabase.ts         # Supabase fetch helper for admin routes
│   │   ├── supabase-browser.ts # Browser-side Supabase client
│   │   ├── supabase-middleware.ts # Middleware Supabase client (cookie refresh)
│   │   └── supabase-server.ts  # Server-side Supabase client (RSC/API routes)
│   └── emails/                 # Email templates
│       └── waitlist.ts         # Waitlist confirmation email
├── data/                       # Static data files
│   ├── glossary-data.ts        # Auto-generated glossary terms (from CSV)
│   ├── glossary-source.csv     # Source CSV for glossary
│   ├── survey-data.ts          # Survey questions and structure
│   ├── survey-source.csv       # Source CSV for survey questions
│   └── countries.ts            # Country list for survey forms
├── __tests__/                  # Unit tests (Vitest)
├── e2e/                        # End-to-end tests (Playwright)
├── scripts/                    # Utility scripts
├── supabase/                   # Supabase migrations and config
├── docs/                       # Additional documentation
│   └── api.md                  # API endpoint documentation
├── load-tests/                 # Load testing files
├── public/                     # Static assets (images, icons, videos)
├── .github/workflows/          # CI/CD workflows
│   ├── ci.yml                  # Build + lint + test
│   ├── security.yml            # Security scanning (secrets, SAST, deps, SBOM)
│   ├── codeql.yml              # Advanced CodeQL analysis
│   ├── release.yml             # Release workflow
│   ├── health-monitor.yml      # Health monitoring
│   ├── lighthouse.yml          # Lighthouse CI
│   └── load-test.yml           # Load testing
├── .planning/                  # Architecture and planning docs
│   └── codebase/               # Codebase analysis files
├── proxy.ts                    # Middleware: CSP headers, CSRF cookies, security logging
├── package.json                # Project manifest
├── package-lock.json           # Dependency lockfile
├── tsconfig.json               # TypeScript configuration (includes @/* path alias)
├── tailwind.config.js          # Tailwind CSS configuration
├── postcss.config.js           # PostCSS configuration
├── eslint.config.mjs           # ESLint flat config
├── vitest.config.ts            # Vitest test configuration
├── playwright.config.ts        # Playwright E2E test configuration
├── next.config.js              # Next.js configuration
├── .env.example                # Environment variable template
├── .gitignore                  # Git ignore rules
├── CLAUDE.md                   # Claude Code instructions
├── SECURITY.md                 # Security documentation
├── DEVELOPMENT.md              # Development setup guide
├── CONTRIBUTING.md             # Contributing guidelines
├── README.md                   # Project README
└── LICENSE                     # License file
```

## Directory Purposes

**app/**

- Purpose: Next.js App Router - pages and API routes
- Contains: Page components (`.tsx`), API handlers (`route.ts`), metadata
- Key files: `layout.tsx` (root layout), `page.tsx` (home), `globals.css`
- Subdirectories: `api/` (endpoints), page directories for each route

**app/api/**

- Purpose: Server-side API endpoints
- Contains: Route handlers for form submissions and utilities
- Key files: `waitlist/route.ts`, `contact/route.ts`, `survey/route.ts`, `health/route.ts`
- Pattern: Each endpoint in its own directory with `route.ts`

**components/**

- Purpose: Reusable UI components organized by page context
- Contains: React components (`.tsx`)
- Subdirectories: `landing/` (14 numbered sections + nav/footer), `about/`, `glossary/`, `legal/`, `survey/`, `admin/`

**components/landing/**

- Purpose: Landing page section components
- Contains: `S01Hero` through `S14CTA`, `NavSection`, `FooterSection`
- Key files: `LandingPage.tsx` (main composition), `ScrollAnimator.tsx`
- Pattern: `S##Name.tsx` — numbered sections with descriptive names

**lib/**

- Purpose: Shared utilities and non-component code
- Contains: Helper functions, email templates, security utilities
- Key files: `analytics.ts`, `csrf.ts`, `ratelimit.ts`, `logger.ts`, `circuit-breaker.ts`, `fetch-with-timeout.ts`
- Subdirectories: `emails/` (email templates), `admin/` (auth, roles, audit, Supabase client helpers)

**data/**

- Purpose: Static data files for glossary and survey
- Contains: Auto-generated glossary terms, survey questions, country list, source CSVs

\***\*tests**/\*\*

- Purpose: Unit tests (Vitest)
- Structure: Mirrors source directory layout

**e2e/**

- Purpose: End-to-end tests (Playwright)
- Contains: Browser-based test specs for 5 browser projects

**public/**

- Purpose: Static assets served at root URL
- Contains: Images, icons, favicons, videos
- Note: Directly accessible at `/images/...`

## Key File Locations

**Entry Points:**

- `app/layout.tsx` - Root layout with fonts, scripts, metadata
- `app/page.tsx` - Landing page entry (renders `LandingPage`)
- `app/about/page.tsx` - About page entry

**Configuration:**

- `tsconfig.json` - TypeScript compiler options (includes `@/*` path alias)
- `next.config.js` - Next.js config
- `tailwind.config.js` - Tailwind with custom design tokens
- `postcss.config.js` - PostCSS plugins
- `eslint.config.mjs` - ESLint flat config
- `vitest.config.ts` - Vitest test configuration
- `playwright.config.ts` - Playwright E2E test configuration
- `.env.local` - Environment variables (gitignored)

**Core Logic:**

- `app/api/waitlist/route.ts` - Waitlist signup handler
- `app/api/contact/route.ts` - Contact form handler
- `lib/analytics.ts` - Analytics event tracking
- `lib/csrf.ts` - CSRF token verification
- `lib/ratelimit.ts` - Supabase-backed rate limiting
- `lib/emails/waitlist.ts` - Email template
- `proxy.ts` - Middleware (CSP, CSRF cookies, security logging)

**Styling:**

- `app/globals.css` - CSS custom properties and utility classes
- `tailwind.config.js` - Design system tokens

**Documentation:**

- `CLAUDE.md` - Claude Code instructions
- `SECURITY.md` - Security guidelines and secrets rotation
- `DEVELOPMENT.md` - Development setup guide
- `CONTRIBUTING.md` - Contributing guidelines
- `docs/api.md` - API endpoint documentation

## Naming Conventions

**Files:**

- `PascalCase.tsx` - React components (e.g., `S01Hero.tsx`, `LandingPage.tsx`)
- `camelCase.ts` - Utility/library files (e.g., `analytics.ts`, `ratelimit.ts`)
- `kebab-case` - Directories (e.g., `app/api/waitlist/`)
- `route.ts` - Next.js API route handlers

**Directories:**

- Lowercase/kebab-case for all directories
- Page directories match URL path (e.g., `about/` -> `/about`)
- Component directories named after page context (`landing/`, `about/`, `glossary/`)

**Special Patterns:**

- `page.tsx` - Next.js page component (required for routes)
- `layout.tsx` - Next.js layout component
- `route.ts` - Next.js API route handler
- `S##Name.tsx` - Numbered landing sections (e.g., `S01Hero.tsx` through `S14CTA.tsx`)

## Where to Add New Code

**New Page:**

- Create `app/{page-name}/page.tsx`
- Add page component to `components/{page-name}/`
- Create `{PageName}Page.tsx` as main composition

**New Landing Section:**

- Add component to `components/landing/`
- Follow naming: `S##Name.tsx`
- Import and add to `LandingPage.tsx`

**New API Endpoint:**

- Create `app/api/{endpoint}/route.ts`
- Export `POST`, `GET`, etc. functions
- Include CSRF verification (`verifyCsrfToken`)
- Include rate limiting (`checkRateLimit`)
- Add Zod schema for validation

**New Utility:**

- Add to `lib/` directory
- Use camelCase naming
- Export typed functions

**New Email Template:**

- Add to `lib/emails/`
- Export object with `subject`, `html`, `text`

## Special Directories

**.next/**

- Purpose: Next.js build output and cache
- Source: Generated by `npm run build` / `npm run dev`
- Committed: No (in `.gitignore`)

**.planning/**

- Purpose: Architecture and planning documentation
- Source: Codebase analysis files
- Committed: Yes (documentation)

**node_modules/**

- Purpose: npm dependencies
- Source: Installed by `npm install`
- Committed: No (in `.gitignore`)

---

_Structure analysis: 2025-01-14_
_Last updated: 2026-03-15_
_Update when directory structure changes_

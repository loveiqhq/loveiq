# Technology Stack

> **Last verified:** 2026-05-31 | **Verified against:** `package.json`, `docs/versions.md`
>
> **Exact pinned versions live in [`docs/versions.md`](../versions.md) and `package.json` (the single sources of truth). This file names the technologies and where they are used; it intentionally avoids duplicating patch-level version numbers so it cannot drift.**

## Languages

**Primary:**

- TypeScript — all application code (`tsconfig.json`)

**Secondary:**

- JavaScript — configuration files (`next.config.js`, `tailwind.config.js`, `postcss.config.js`) and data-generation scripts

## Runtime

**Environment:**

- Node.js (engines range pinned in `package.json` → see `docs/versions.md`)
- Browser runtime (React client components)

**Package Manager:**

- npm — lockfile: `package-lock.json`

## Frameworks

**Core:**

- Next.js 16 — full-stack React framework with App Router (`package.json`)
- React 19 — UI component library (`package.json`)

**Testing:**

- Vitest — unit/integration test runner (`package.json`, `__tests__/`, colocated `*/tests/`)
- Playwright — E2E browser testing (`package.json`, `e2e/`)
- @axe-core/playwright — accessibility audits in E2E
- @testing-library/react — React component testing utilities

**Build/Dev:**

- TypeScript — type checking (`npm run typecheck`)
- PostCSS + Autoprefixer — CSS processing (`postcss.config.js`)
- Tailwind CSS 3 — utility-first CSS (`tailwind.config.js`)
- ESLint (flat config) — linting (`eslint.config.mjs`)
- Prettier — formatting (lint-staged on commit)
- Husky — git hooks (pre-push runs unit tests)

## Key Dependencies

**Critical:**

- Resend — transactional email (`app/api/contact/route.ts`, `app/api/invite/route.ts`, feature `*/emails/`)
- Zod — schema validation (`app/api/**/route.ts`)
- @supabase/supabase-js + @supabase/ssr — Supabase client + server-side auth helpers (`features/admin/server/`, `shared/auth/`)
- Lenis — smooth scroll library (`shared/ui/SmoothScroll.tsx`)
- Stripe — checkout + webhooks (`features/checkout/server/`, `app/api/stripe/webhook/route.ts`)
- @upstash/redis — rate-limiter backing store (`shared/http/ratelimit.ts`)
- svix — webhook signature verification (Resend webhook)

**Observability:**

- @vercel/otel — OpenTelemetry for Vercel
- pino — structured logging (`shared/observability/logger.ts`)
- web-vitals — Core Web Vitals reporting (`shared/ui/WebVitals.tsx`)

**Infrastructure:**

- next/font/google — font optimization (`app/layout.tsx`) — Manrope (sans), Lora (serif)
- next/script — script loading optimization (`app/layout.tsx`)

**Dev Only:**

- @types/node, @types/react, @types/react-dom — type definitions
- eslint-config-next, eslint-plugin-no-secrets, eslint-plugin-security — lint rule sets
- @next/bundle-analyzer — bundle size visualization (`npm run analyze`)
- csv-parse, mammoth — used by data-generation scripts in `scripts/`

## Configuration

**Environment:**

- `.env.local` for environment variables (gitignored); template in `.env.example`
- Canonical variable reference: `CLAUDE.md` (Environment Variables table) and `.env.example`. Security-sensitive rotation guidance: `docs/runbooks/SECURITY.md`

**Build:**

- `tsconfig.json` — TypeScript compiler options (strict mode; aliases `@/*`, `@shared/*`, `@features/*`)
- `next.config.js` — Next.js configuration
- `tailwind.config.js` — Tailwind with custom design tokens
- `postcss.config.js` — PostCSS with Tailwind and Autoprefixer
- `eslint.config.mjs` — flat ESLint config (ESLint 9+)
- `proxy.ts` — Next.js middleware: CSP headers, CSRF cookies, security logging

## Platform Requirements

**Development:**

- Any platform with Node.js (version range in `package.json`)
- No containerization required

**Production:**

- Vercel-ready (Next.js optimized)
- Strict CSP headers configured in `proxy.ts`
- HSTS, X-Frame-Options, and other security headers enabled

---

_Last updated: 2026-05-31_
_Update after major dependency changes; exact versions are tracked in `docs/versions.md`._

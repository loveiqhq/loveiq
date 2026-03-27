# LoveIQ

Marketing website for LoveIQ — a science-backed relationship intelligence platform.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 3.4 + CSS custom properties
- **Email:** Resend
- **Database:** Supabase (waitlist storage + rate limiting)
- **Deployment:** Vercel
- **Testing:** Vitest + Playwright

## Quick Start

```bash
npm install
cp .env.example .env.local   # Edit with your values (optional for UI work)
npm run dev                   # http://localhost:3000
```

Or use the setup script:

```bash
npm run setup                 # Install deps + create .env.local
npm run dev
```

## Scripts

| Command                       | Description                           |
| ----------------------------- | ------------------------------------- |
| `npm run dev`                 | Start dev server (Turbopack)          |
| `npm run build`               | Production build                      |
| `npm run start`               | Run production build locally          |
| `npm run lint`                | Run ESLint                            |
| `npm test`                    | Run unit/integration tests            |
| `npm run test:watch`          | Run tests in watch mode               |
| `npm run test:coverage`       | Run tests with coverage report        |
| `npm run test:e2e`            | Run E2E tests (Playwright)            |
| `npm run analyze`             | Bundle size analysis (visual treemap) |
| `npm run check`               | Lint + test + build (full CI check)   |
| `npm run setup`               | Install deps + create .env.local      |
| `npm run update:product-kpis` | Update product KPIs from CSV          |

## Project Structure

```
app/                  # Next.js App Router (pages + API routes)
  api/                # API endpoints (contact, waitlist, survey, invite, invite-tracking, survey-partial, survey-tracking, health, staging-*, admin/*)
components/           # React components
  landing/            # Landing page sections (S01-S14)
  about/              # About page sections
  glossary/           # Glossary components
lib/                  # Shared utilities (analytics, CSRF, rate limiting)
public/               # Static assets
proxy.ts              # Middleware (CSP, security headers, CSRF cookies)
```

## Documentation

- [Development Guide](DEVELOPMENT.md) — Setup, environment variables, common issues
- [Security Guide](SECURITY.md) — Secrets, rotation, scanning, incident response
- [Contributing](CONTRIBUTING.md) — PR process, coding standards, commit conventions
- [Architecture](.planning/codebase/ARCHITECTURE.md) — System design and data flows
- [Conventions](.planning/codebase/CONVENTIONS.md) — Code patterns and naming
- [API Reference](docs/api.md) — API endpoint documentation

## Environment Variables

Copy `.env.example` to `.env.local`. The site renders without env vars — forms will fail gracefully with error messages. See [Development Guide](DEVELOPMENT.md) for details.

## License

Copyright (c) 2025-2026 LoveIQ. All rights reserved. See [LICENSE](LICENSE).

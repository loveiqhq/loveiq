# LoveIQ

> Owner: CODEOWNERS default
> Last verified: 2026-04-05
> Verified against: `package.json`, `.env.example`, `.github/workflows/ci.yml`, `app/api/**`, `proxy.ts`

Marketing site and survey platform for LoveIQ, a relationship intelligence product with a public site, survey flow, and an authenticated admin surface.

## Stack

- Next.js App Router
- React + TypeScript
- Tailwind CSS + CSS custom properties
- Supabase for data, auth, and rate-limit persistence
- Resend for transactional email
- Vitest + Playwright for test coverage

Exact pinned versions live in [docs/versions.md](docs/versions.md).

## Quick Start

Recommended setup:

```bash
npm run setup
npm run dev
```

Manual setup:

```bash
npm install
npm run dev
```

`npm run setup` installs dependencies and creates `.env.local` from `.env.example` when the file is missing.

## Validation

After `npm run dev`, confirm:

1. `http://localhost:3000` loads.
2. The app sets a `__csrf` cookie on first page load.
3. `npm run check` passes before you open a PR.
4. `npm run docs:truth` passes when you changed docs, API routes, env vars, scripts, or workflows.

## Scripts

| Command                       | Description                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`                 | Start the local Next.js dev server.                                                    |
| `npm run build`               | Build the production app.                                                              |
| `npm run start`               | Serve the production build locally.                                                    |
| `npm run lint`                | Run ESLint across the repo.                                                            |
| `npm test`                    | Run unit and integration tests once.                                                   |
| `npm run test:watch`          | Run Vitest in watch mode.                                                              |
| `npm run test:coverage`       | Run tests with coverage output.                                                        |
| `npm run test:e2e`            | Run Playwright end-to-end tests.                                                       |
| `npm run analyze`             | Build with bundle analysis enabled.                                                    |
| `npm run check`               | Run lint, tests, and build.                                                            |
| `npm run setup`               | Install dependencies and create `.env.local` when missing.                             |
| `npm run docs:truth`          | Verify markdown links, documented scripts/env vars, pinned versions, and API coverage. |
| `npm run update:product-kpis` | Refresh generated KPI data from CSV inputs.                                            |

## Project Layout

```text
app/                  Next.js routes, pages, and API handlers
components/           Shared UI components, including the admin surface
lib/                  Shared server and client utilities
data/                 Generated and source data files
docs/                 Canonical developer documentation
scripts/              Repo automation and maintenance scripts
supabase/             Supabase SQL and related assets
proxy.ts              Security headers, CSP, and CSRF cookie management
```

See [FILE_INDEX.md](FILE_INDEX.md) for task-based file lookup.

For admin work, start with [docs/admin/AGENT_README.md](docs/admin/AGENT_README.md) instead of scanning the full admin tree.

## Canonical Docs

- [DEVELOPMENT.md](docs/runbooks/DEVELOPMENT.md) - local setup, env vars, and troubleshooting
- [CONTRIBUTING.md](CONTRIBUTING.md) - branch, testing, and PR expectations
- [SECURITY.md](docs/runbooks/SECURITY.md) - secrets, rotation, scanning, and response guidance
- [docs/api.md](docs/api.md) - public API reference
- [docs/survey.md](docs/survey.md) - survey runtime, persistence, and recovery flow
- [docs/admin-api.md](docs/admin-api.md) - admin API route catalog
- [docs/admin-dashboard.md](docs/admin-dashboard.md) - admin shell, command center, and stats dashboard reference
- [docs/admin/AGENT_README.md](docs/admin/AGENT_README.md) - admin domain router across routes, APIs, UI, and logic
- [docs/versions.md](docs/versions.md) - single source of truth for pinned versions
- [docs/doc-inventory.md](docs/doc-inventory.md) - project documentation inventory
- [docs/knowledge-ledger.md](docs/knowledge-ledger.md) - verified documentation updates and why they matter
- [.planning/codebase/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) - codebase architecture reference
- [.planning/codebase/CONVENTIONS.md](docs/architecture/CONVENTIONS.md) - implementation conventions

## Environment Variables

Copy `.env.example` to `.env.local` only if you need local integrations. The UI renders without env vars, but form submissions, admin auth, and health checks degrade when required services are unconfigured.

Environment variable details live in [DEVELOPMENT.md](docs/runbooks/DEVELOPMENT.md). Secret handling and rotation policy live in [SECURITY.md](docs/runbooks/SECURITY.md).

## License

Copyright (c) 2025-2026 LoveIQ. All rights reserved. See [LICENSE](LICENSE).

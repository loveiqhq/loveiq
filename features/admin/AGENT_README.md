# features/admin

**Purpose:** Internal admin / operator tooling — submissions browser, survey/research intelligence, growth analytics, scoring comparison, KPI dashboards, lifecycle drills. Protected by Supabase Auth magic-link sessions. Allowlist in `admin_users` table.

**Subtrees:**

- `ui/` — 22 internal subdomains: activity, alerts, analytics, annotations, archetypes, changelog, comments, comparisons, dashboard-subscriptions, export, funnels, growth, health, hooks, intelligence, journey, kpi-tabs, pulse, reports, revenue, scorecard, scoring, strategy.
- `server/` — analytics/, intelligence/, strategy/, lifecycle/, metrics/, research/, etc. (77 files preserving their internal grouping).
- `server/emails/admin-magic-link.ts` — magic-link email template.
- `tests/` — ~95 admin tests (API + components + lib).

**Entry points:**

- `app/admin/page.tsx` — dashboard root (UI from `features/admin/ui/`).
- `app/api/admin/*/route.ts` — API routes (140+); each imports server logic from `features/admin/server/`.

**Belongs:** internal-only operator tooling, admin-specific helpers, admin emails, admin tests.

**Does NOT belong:**

- Customer-facing UI/logic (use `features/<domain>/`).
- Shared infrastructure like CSRF/ratelimit (use `lib/`/`shared/`).

**Conventions:**

- Coverage thresholds exclude admin (per `vitest.config.ts`) because depth would dilute the customer-facing gate. Every mutating admin route still has CSRF/RBAC/rate-limit/Zod auth-gate tests.
- Engine version pinning: admin dashboards query `engine_version=v4+v5` (see `features/admin/server/metric-library.ts`). Bumping breaks dashboards.

**Related:**

- `docs/admin/domains/*.md` — per-domain operator runbooks.
- `lib/admin/AGENT_README.md` is removed; the index lives here. Required by `scripts/check-docs-truth.mjs`.

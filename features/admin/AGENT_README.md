# features/admin

**Purpose:** The internal admin. Since 16 Oct 2026 it is AP-Analytics only: the team's analytics pages at `/admin/ap` and the sign-in to them. Its server code also serves the remaining admin API routes, the Slack digest crons and the company brain. Protected by Supabase Auth magic-link sessions. Allowlist in `admin_users` table.

**Subtrees:**

- `ui/` — `ap/` (AP-Analytics: shell, sidebar, filter bar and one component per page), `AdminLoginForm.tsx`, `DashboardErrorBoundary.tsx`, `hooks/useAdminFetch.ts`.
- `server/` — `ap/` (AP's figures), sign-in, roles and audit, GDPR export and erasure, and the modules the digest crons and the brain import.
- `server/emails/admin-magic-link.ts` — magic-link email template.
- `tests/` — ~50 admin tests (AP pages and routes, sign-in, GDPR, digests).

**Entry points:**

- `app/admin/ap/**/page.tsx` — the AP pages (UI from `features/admin/ui/ap/`).
- `app/api/admin/**/route.ts` (and the one `route.tsx`, the digest images) — the 20 admin API routes; they import their server logic from `features/admin/server/`.

**Belongs:** internal-only operator tooling, admin-specific helpers, admin emails, admin tests.

**Does NOT belong:**

- Customer-facing UI/logic (use `features/<domain>/`).
- Shared infrastructure like CSRF/ratelimit (use `shared/`).

**Conventions:**

- Coverage thresholds exclude admin (per `vitest.config.ts`) because depth would dilute the customer-facing gate. The admin tests in `tests/` still run.
- Engine version pinning: `features/admin/server/metric-library.ts` filters `scoring_result` on `engine_version=v4+v5` (see `docs/adr/0001-engine-version-stability.md`). Bumping the stored value breaks that read.

**Related:**

- `docs/admin/domains/*.md` — per-domain maps.
- Admin server/UI indexes live in `features/admin/server/AGENT_README.md` and `features/admin/ui/AGENT_README.md` (both required by `scripts/check-docs-truth.mjs`).

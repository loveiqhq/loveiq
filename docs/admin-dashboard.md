# Admin Dashboard and Shell

> Owner: CODEOWNERS default
> Last verified: 2026-04-05
> Verified against: `app/admin/**`, `components/admin/**`, `app/api/admin/os/route.ts`, `app/api/admin/stats/route.ts`, `app/api/admin/actions/route.ts`, `app/api/admin/actions/[id]/route.ts`, `lib/admin/auth.ts`, `lib/admin/roles.ts`
> Canonical source: Product-surface reference for the `/admin` shell and dashboard composition; route contracts live in [admin-api.md](admin-api.md).

This document covers the authenticated admin UI: shell layout, access model, sidebar structure, the current `/admin` landing page, and the distinction between the command-center surface and the stats dashboard component.

For fastest cross-root lookup, start with [docs/admin/AGENT_README.md](admin/AGENT_README.md) and then jump back here for shell behavior details.

## Access Model

- Admin authentication is magic-link based. The public login request starts at [`POST /api/admin/login`](admin-api.md#access-and-admin-shell).
- API routes and supporting server utilities verify the current Supabase Auth user through [`verifyAdminSession()`](../features/admin/server/auth.ts), then map the email into `admin_users`.
- Canonical role hierarchy lives in [`lib/admin/roles.ts`](../features/admin/server/roles.ts): `viewer`, `editor`, `admin`.
- `/admin/login` renders without the admin shell. All other `/admin/*` routes render through [`app/admin/layout.tsx`](../app/admin/layout.tsx).
- Sidebar logout posts to [`/api/admin/logout`](../app/api/admin/logout/route.ts) with a CSRF token, then redirects back to `/admin/login`.

## Shell Composition

| Surface                 | Backing file(s)                                                                            | Notes                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Route shell             | [`app/admin/layout.tsx`](../app/admin/layout.tsx)                                          | Wraps the authenticated admin area with sidebar, header, command palette, and page-presence indicator. |
| Sidebar navigation      | [`components/admin/AdminSidebar.tsx`](../features/admin/ui/AdminSidebar.tsx)               | Owns route grouping, active-link logic, and logout.                                                    |
| Header                  | [`components/admin/AdminHeader.tsx`](../features/admin/ui/AdminHeader.tsx)                 | Receives the title and mobile-menu callback from the layout.                                           |
| Command palette         | [`components/admin/AdminCommandPalette.tsx`](../features/admin/ui/AdminCommandPalette.tsx) | Mounted globally inside the shell for authenticated pages.                                             |
| Page presence indicator | [`components/admin/PagePresence.tsx`](../features/admin/ui/PagePresence.tsx)               | Rendered in the upper-right utility area of the shell.                                                 |

`app/admin/layout.tsx` derives the displayed header title and description from `usePathname()`. For `/admin`, the shell title is currently `Dashboard`, while the page metadata and page body identify the surface as `Command Center`.

## Landing Surfaces

| Surface                   | Route                          | Backing file(s)                                                                                                                                 | Primary data source                                                                                                                                                                                | Notes                                                                                                              |
| ------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Command Center            | `/admin`                       | [`app/admin/page.tsx`](../app/admin/page.tsx), [`components/admin/CommandCenterDashboard.tsx`](../features/admin/ui/CommandCenterDashboard.tsx) | [`GET /api/admin/os`](../app/api/admin/os/route.ts), [`GET/POST /api/admin/actions`](../app/api/admin/actions/route.ts), [`PATCH /api/admin/actions/[id]`](../app/api/admin/actions/[id]/route.ts) | This is the current landing page rendered by the route tree.                                                       |
| Stats dashboard component | Not the current `/admin` route | [`components/admin/AdminStatsDashboard.tsx`](../features/admin/ui/AdminStatsDashboard.tsx)                                                      | [`GET /api/admin/stats`](../app/api/admin/stats/route.ts)                                                                                                                                          | Rich analytics component that still exists in the codebase, but `app/admin/page.tsx` does not currently render it. |

## Sidebar Structure

Sidebar groups are defined in [`components/admin/AdminSidebar.tsx`](../features/admin/ui/AdminSidebar.tsx):

| Group                    | Representative routes                                                                                                                                                                                                                                                                           | Notes                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Core leadership surfaces | `/admin`, `/admin/operating-review`, `/admin/strategy-lead`, `/admin/product-lead`, `/admin/growth-lead`, `/admin/tech-lead`, `/admin/strategy`, `/admin/experiments`                                                                                                                           | Top-level leadership and operating surfaces.                                         |
| Analytics                | `/admin/funnels`, `/admin/comparisons`, `/admin/answers`, `/admin/pulse`, `/admin/growth`, `/admin/pipeline`, `/admin/scoring`, `/admin/reports`, `/admin/revenue`, `/admin/retention`, `/admin/research`, `/admin/journey`, `/admin/replay`, `/admin/predictions`, `/admin/question-lifecycle` | Read-heavy dashboards and analysis views.                                            |
| Admin operations         | `/admin/goals`, `/admin/org`, `/admin/submissions`, `/admin/report-builder`, `/admin/changelog`, `/admin/tags`, `/admin/auto-tag-rules`, `/admin/tools`, `/admin/activity`, `/admin/health`, `/admin/benchmarks`                                                                                | Operational management and registry tooling.                                         |
| Danger                   | `/admin/survey-status`                                                                                                                                                                                                                                                                          | Isolated to the bottom of the sidebar because it changes public survey availability. |

Use [admin-api.md](admin-api.md) for the full API route inventory behind these surfaces.

## Command Center Behavior

`CommandCenterDashboard` is the active landing surface and currently renders:

- Action summary stat cards from `data.actionBoard.summary`
- Cross-functional briefs from `data.briefs`
- Embedded intelligence, command memory, operating graph, and simulation panels
- A metric board and leading-indicator board sourced from the admin OS snapshot
- An action tracker with create and status-update workflows
- Role cockpit links, decision review items, trust board, priority watchlist, and operating timeline

The page uses a `days` query window in [`useAdminFetch`](../features/admin/ui/hooks/useAdminFetch.ts), defaulting to `30`. The supporting [`GET /api/admin/os`](../app/api/admin/os/route.ts) route requires `viewer+` access, rate-limits requests to 20 per minute per IP, and returns the snapshot built by [`buildAdminOsSnapshot`](../features/admin/server/os.ts).

The action tracker is intentionally lighter-weight than full project management:

- Read action items: [`GET /api/admin/actions`](../app/api/admin/actions/route.ts), `viewer+`
- Create action items: [`POST /api/admin/actions`](../app/api/admin/actions/route.ts), `editor+`, CSRF required
- Update action items: [`PATCH /api/admin/actions/[id]`](../app/api/admin/actions/[id]/route.ts), `editor+`, CSRF required

## Stats Dashboard Behavior

`AdminStatsDashboard` is still the codebase's dedicated analytics-heavy dashboard component. It fetches [`/api/admin/stats`](../app/api/admin/stats/route.ts) and renders:

- Submission totals, completion, duration, and status breakdowns
- Behavior analytics such as drop-off, backtracking, chapter funnel, and average time per question
- Waitlist, invite-click, and UTM-source breakdowns
- Answer, scoring, and archetype distributions
- Period-over-period deltas when available

The supporting stats route requires `viewer+` access, accepts a `days` query param, and rate-limits requests to 30 per minute per IP.

## Related Coverage

- Admin auth utility: [`__tests../features/admin/tests/admin-auth-lib.test.ts`](../features/admin/tests/admin-auth-lib.test.ts)
- Admin login route: [`__tests__/api/admin-login.test.ts`](../features/admin/tests/admin-login.test.ts)
- Admin stats route: [`__tests__/api/admin-stats.test.ts`](../features/admin/tests/admin-stats.test.ts)
- Shared admin fetch hook: [`__tests../features/admin/tests/admin-hooks/useAdminFetch.test.ts`](../features/admin/tests/admin-hooks/useAdminFetch.test.ts)
- End-to-end admin flow: [`e2e/admin.spec.ts`](../e2e/admin.spec.ts)

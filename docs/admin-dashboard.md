# Admin Pages and Shell

> Owner: CODEOWNERS default
> Last verified: 2026-10-16
> Verified against: `app/admin/**`, `features/admin/ui/**`, `next.config.js`, `proxy.ts`, `features/admin/server/auth.ts`, `features/admin/server/roles.ts`
> Canonical source: Product-surface reference for the `/admin` pages and their shell; route contracts live in [admin-api.md](admin-api.md).

Since 16 Oct 2026 the admin is AP-Analytics only (owner decision). The old dark shell
(sidebar, header, command palette) and its pages were removed: Overview (`/admin`), Core
KPIs, Data Explorer, User Journey, Funnels & Cohorts, Answer Explorer, Submissions (list,
detail, compare, partial drafts) and Survey Status, along with older dashboards nothing
rendered any more, such as the Command Center. `/admin` and those pages' old addresses
redirect to `/admin/ap` (`next.config.js`, not permanent).

For fastest cross-root lookup, start with [docs/admin/AGENT_README.md](admin/AGENT_README.md).

## Access Model

- Sign-in is by magic link. [`/admin/login`](../app/admin/login/page.tsx) renders [`AdminLoginForm`](../features/admin/ui/AdminLoginForm.tsx) in AP's light design and posts to [`POST /api/admin/login`](admin-api.md#sign-in-gdpr-submissions-and-kill-switch), which sends a link only to an address in `admin_users`.
- The link opens [`/admin/auth/callback`](../app/admin/auth/callback/route.ts), which sets the session and lands on `/admin/ap`.
- `proxy.ts` sends a signed-out visitor to `/admin/login`, and after 30 minutes without activity to `/admin/login?error=idle_timeout`, where the form says why.
- API routes check the session again through [`verifyAdminSession()`](../features/admin/server/auth.ts) and map the email to its role in `admin_users`. The role hierarchy lives in [`features/admin/server/roles.ts`](../features/admin/server/roles.ts): `viewer`, `editor`, `admin`.
- "Sign out" in AP's sidebar posts to [`/api/admin/logout`](../app/api/admin/logout/route.ts) with a CSRF token, then returns to `/admin/login`.

## Shell

| Layer        | Backing file(s)                                                                                                                                | Notes                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Admin layout | [`app/admin/layout.tsx`](../app/admin/layout.tsx)                                                                                              | Draws nothing. It identifies the signed-in admin to PostHog from the `admin_posthog_distinct_id` cookie the callback sets.       |
| AP shell     | [`app/admin/ap/layout.tsx`](../app/admin/ap/layout.tsx), [`features/admin/ui/ap/ApShell.tsx`](../features/admin/ui/ap/ApShell.tsx)             | The light frame around every `/admin/ap` page. It reads who is signed in and how fresh the sources are (`/api/admin/ap/status`). |
| Sidebar      | [`features/admin/ui/ap/ApSidebar.tsx`](../features/admin/ui/ap/ApSidebar.tsx), [`features/admin/ui/ap/nav.ts`](../features/admin/ui/ap/nav.ts) | The page list (`NAV`), the active link and "Sign out". Links between report pages keep the filters.                              |
| Filter bar   | [`features/admin/ui/ap/ApFilterBar.tsx`](../features/admin/ui/ap/ApFilterBar.tsx)                                                              | Period and narrowing on the report pages, with saved filters (`/api/admin/ap/saved-filters`).                                    |
| Error box    | [`features/admin/ui/DashboardErrorBoundary.tsx`](../features/admin/ui/DashboardErrorBoundary.tsx)                                              | Wraps each page, so one failing page shows its own error in AP's colors instead of blanking the app.                             |

## Pages

| Page                   | Route                                    | Component                                                              | Feed                                                                              |
| ---------------------- | ---------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Dashboard              | `/admin/ap`                              | [`ApFocus.tsx`](../features/admin/ui/ap/ApFocus.tsx)                   | `GET /api/admin/ap/focus`                                                         |
| Assessment A dashboard | `/admin/ap/assessment-a`                 | [`ApDashboard.tsx`](../features/admin/ui/ap/ApDashboard.tsx)           | `GET /api/admin/ap/assessment`                                                    |
| Traffic                | `/admin/ap/assessment-a/traffic`         | [`ApTraffic.tsx`](../features/admin/ui/ap/ApTraffic.tsx)               | `GET /api/admin/ap/traffic`                                                       |
| Landing page           | `/admin/ap/assessment-a/landing`         | [`ApLanding.tsx`](../features/admin/ui/ap/ApLanding.tsx)               | `GET /api/admin/ap/landing` (the sidebar's "Assessment page" is a section of it)  |
| Survey                 | `/admin/ap/assessment-a/survey`          | [`ApSurvey.tsx`](../features/admin/ui/ap/ApSurvey.tsx)                 | `GET /api/admin/ap/survey`, `GET /api/admin/ap/survey/answers`                    |
| Report                 | `/admin/ap/assessment-a/report`          | [`ApReport.tsx`](../features/admin/ui/ap/ApReport.tsx)                 | `GET /api/admin/ap/report`                                                        |
| Payment                | `/admin/ap/assessment-a/payment`         | [`ApPayment.tsx`](../features/admin/ui/ap/ApPayment.tsx)               | `GET /api/admin/ap/payment`                                                       |
| Pay to start           | `/admin/ap/assessment-a/pay-to-start`    | [`ApPayToStart.tsx`](../features/admin/ui/ap/ApPayToStart.tsx)         | `GET /api/admin/ap/pay-to-start`                                                  |
| Unlock feedback        | `/admin/ap/assessment-a/unlock-feedback` | [`ApUnlockFeedback.tsx`](../features/admin/ui/ap/ApUnlockFeedback.tsx) | `GET /api/admin/ap/unlock-feedback`                                               |
| Catalog (data sources) | `/admin/ap/sources`                      | [`ApSources.tsx`](../features/admin/ui/ap/ApSources.tsx)               | `GET`/`PUT /api/admin/ap/catalog`, `GET /api/admin/ap/catalog/rows`               |
| Raw data explorer      | `/admin/ap/explorer`                     | [`ApExplorer.tsx`](../features/admin/ui/ap/ApExplorer.tsx)             | `GET /api/admin/ap/explorer`, `POST /api/admin/ap/explorer/unlock`, saved filters |

Pay to start sets each funnel's steps out as funnel bands, with the market's reference rate
beside ours where a source exists (named under the cards), its money with profit per paying
customer and per survey completion (Traffic's formula), and an info card on every figure.
Landing's pay-to-start table counts "Started survey" from `prepaid_report_access.survey_started_at`,
recorded from 28 Oct 2026. Traffic shows each search ad as searchers see it, with its
keywords' spend, cost per survey, payment rate and revenue per survey.

Each page is a thin wrapper in `app/admin/ap/**/page.tsx` that renders its component
inside `DashboardErrorBoundary`. The components load their data through
[`useAdminFetch`](../features/admin/ui/hooks/useAdminFetch.ts). "Assessment B" and
"Assessment C" are in the sidebar as "soon", with no page yet.

Use [admin-api.md](admin-api.md) for each route's methods and roles.

## What the admin no longer does

- **Submissions:** there is no submissions page. One submission can still be read,
  corrected or deleted through the API-only `/api/admin/submissions/[id]`; see
  [docs/admin/domains/submissions.md](admin/domains/submissions.md).
- **Closing the survey:** there is no switch. Set `survey.status` in the database.

## Related Coverage

- Admin auth utility: [`features/admin/tests/admin-auth-lib.test.ts`](../features/admin/tests/admin-auth-lib.test.ts)
- Admin login route: [`features/admin/tests/admin-login.test.ts`](../features/admin/tests/admin-login.test.ts)
- Sign-in form: [`features/admin/tests/AdminLoginForm.test.tsx`](../features/admin/tests/AdminLoginForm.test.tsx)
- Magic-link callback: [`features/admin/tests/admin-auth-callback.test.ts`](../features/admin/tests/admin-auth-callback.test.ts)
- AP route guard and explorer routes: [`features/admin/tests/ap-routes.test.ts`](../features/admin/tests/ap-routes.test.ts)
- Shared admin fetch hook: [`features/admin/tests/admin-hooks/useAdminFetch.test.ts`](../features/admin/tests/admin-hooks/useAdminFetch.test.ts)
- End-to-end sign-in page and signed-out redirect: [`e2e/admin.spec.ts`](../e2e/admin.spec.ts)

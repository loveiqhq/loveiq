# app/admin/

Authenticated admin page routes. Since 16 Oct 2026 the admin is AP-Analytics only: `/admin` and the old pages' addresses redirect to `/admin/ap` (`next.config.js`).

## What belongs here

- Thin `page.tsx` wrappers for the AP-Analytics pages under `ap/`, each inside `DashboardErrorBoundary`
- `ap/layout.tsx` for AP's light shell
- `layout.tsx`, which only sets the signed-in admin's PostHog identity
- The sign-in page under `login/` and the magic-link callback under `auth/`

## What does not belong here

- Page UI implementations: use [`features/admin/ui/AGENT_README.md`](../../features/admin/ui/AGENT_README.md)
- Admin API handlers: use [`app/api/admin/AGENT_README.md`](../api/admin/AGENT_README.md)
- Server-side admin data assembly: use [`features/admin/server/AGENT_README.md`](../../features/admin/server/AGENT_README.md)

## How to navigate

Start with the domain doc in [`docs/admin/domains/AGENT_README.md`](../../docs/admin/domains/AGENT_README.md), then jump back into this route tree only for the page wrapper you need.

| Pages        | Page routes to start with                                                                                                                                                      | Canonical lookup doc                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| AP-Analytics | `ap/page.tsx` (Dashboard), `ap/assessment-a/page.tsx` with `traffic/`, `landing/`, `survey/`, `report/` and `payment/` under it, `ap/sources/page.tsx`, `ap/explorer/page.tsx` | [`docs/admin-dashboard.md`](../../docs/admin-dashboard.md) |

## Key entry files

- `layout.tsx`: the signed-in admin's PostHog identity; draws nothing
- `ap/layout.tsx`: AP's light shell (`features/admin/ui/ap/ApShell.tsx`)
- `login/page.tsx`: public admin sign-in page
- `auth/callback/route.ts`: magic-link callback; a sign-in lands on `/admin/ap`

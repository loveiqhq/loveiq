# app/admin/

Authenticated admin page routes.

## What belongs here

- Thin `page.tsx` wrappers for `/admin/*` routes
- `layout.tsx` for the shared admin shell
- Auth callback plumbing under `auth/`

## What does not belong here

- Dashboard UI implementations: use [`features/admin/ui/AGENT_README.md`](../../features/admin/ui/AGENT_README.md)
- Admin API handlers: use [`app/api/admin/AGENT_README.md`](../api/admin/AGENT_README.md)
- Server-side admin data assembly: use [`features/admin/server/AGENT_README.md`](../../features/admin/server/AGENT_README.md)

## How to navigate

Start with the domain doc in [`docs/admin/domains/AGENT_README.md`](../../docs/admin/domains/AGENT_README.md), then jump back into this route tree only for the page wrapper you need.

| Domain                     | Page routes to start with                                                                                                                                 | Canonical lookup doc                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Submissions and moderation | `submissions/page.tsx`, `submissions/[id]/page.tsx`, `submissions/compare/page.tsx`, `submissions/partial/[sessionId]/page.tsx`, `survey-status/page.tsx` | [`docs/admin/domains/submissions.md`](../../docs/admin/domains/submissions.md) |

## Key entry files

- `layout.tsx`: admin shell wrapper
- `page.tsx`: default `/admin` landing route
- `login/page.tsx`: public admin sign-in page
- `auth/callback/route.ts`: magic-link callback

# app/api/admin/

Authenticated admin API route handlers. Since 16 Oct 2026 the admin is AP-Analytics only; the old admin's routes were removed.

## What belongs here

- `route.ts` handlers under `/api/admin/*`
- Route-specific validation, auth gating, and response shaping

## What does not belong here

- Shared auth and data helpers: use [`features/admin/server/AGENT_README.md`](../../../features/admin/server/AGENT_README.md)
- Admin UI components: use [`features/admin/ui/AGENT_README.md`](../../../features/admin/ui/AGENT_README.md)
- High-level route inventory prose: use [`docs/admin-api.md`](../../../docs/admin-api.md)

## How to navigate

Use the domain docs in [`docs/admin/domains/AGENT_README.md`](../../../docs/admin/domains/AGENT_README.md) when you know the task but not the route family.

| Domain                           | Route files to start with                                       | Canonical lookup doc                                                              |
| -------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| AP-Analytics                     | `ap/**` (14 routes)                                             | [`docs/admin-dashboard.md`](../../../docs/admin-dashboard.md)                     |
| One submission and GDPR requests | `submissions/[id]/route.ts`, `data-subject/route.ts` (API only) | [`docs/admin/domains/submissions.md`](../../../docs/admin/domains/submissions.md) |

## Key entry files

- `login/route.ts`: public admin-login trigger
- `logout/route.ts`: session teardown
- `ap/**`: AP-Analytics feeds, all behind `apGuard` (see [`docs/admin-api.md`](../../../docs/admin-api.md))
- `system-flags/route.ts`: the incident kill switches (API only)
- `digest-image/[kind]/route.tsx`: the Slack digests' chart images, authorized by a signed URL instead of a session

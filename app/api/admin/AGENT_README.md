# app/api/admin/

Authenticated admin API route handlers.

## What belongs here

- `route.ts` handlers under `/api/admin/*`
- Route-specific validation, auth gating, and response shaping

## What does not belong here

- Shared auth and data helpers: use [`features/admin/server/AGENT_README.md`](../../../features/admin/server/AGENT_README.md)
- Admin UI components: use [`features/admin/ui/AGENT_README.md`](../../../features/admin/ui/AGENT_README.md)
- High-level route inventory prose: use [`docs/admin-api.md`](../../../docs/admin-api.md)

## How to navigate

Use the domain docs in [`docs/admin/domains/AGENT_README.md`](../../../docs/admin/domains/AGENT_README.md) when you know the task but not the route family.

| Domain                     | Route families to start with                                                                   | Canonical lookup doc                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Submissions and moderation | `submissions/**`, `export`, `export-presets`, `survey-status`, `tags`, `tag-rules`, `comments` | [`docs/admin/domains/submissions.md`](../../../docs/admin/domains/submissions.md) |

## Key entry files

- `login/route.ts`: public admin-login trigger
- `logout/route.ts`: session teardown
- `os/route.ts`: command-center snapshot
- `stats/route.ts`: dedicated stats feed used by the stats dashboard component

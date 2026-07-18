# features/admin/server/

Admin-only server utilities, data assembly, and analytics logic.

## What belongs here

- Auth and role checks for the admin surface
- Supabase helpers for admin route handlers and server components
- Domain-specific analytics builders and formatters consumed by `/api/admin/*`
- Admin transactional email templates under `emails/`

## What does not belong here

- Route handlers: use [`app/api/admin/AGENT_README.md`](../../../app/api/admin/AGENT_README.md)
- Admin UI composition: use [`features/admin/ui/AGENT_README.md`](../ui/AGENT_README.md)
- Global utilities shared outside admin: use [`shared/AGENT_README.md`](../../../shared/AGENT_README.md)

## How to navigate

When the task starts from product language instead of a file path, begin with [`docs/admin/domains/AGENT_README.md`](../../../docs/admin/domains/AGENT_README.md).

| Domain                     | Core files                                                                                                                                                | Canonical lookup doc                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Submissions and moderation | `survey-partials.ts`, `segment-preview.ts`, `segment-evaluator.ts`, `segment-migration.ts`, `drilldowns.ts`, `delete-submission.ts`, `test-submission.ts` | [`docs/admin/domains/submissions.md`](../../../docs/admin/domains/submissions.md) |

Subdirectories: `emails/` (admin magic-link template), `intelligence/`, and `strategy/` hold helper/type modules grouped with their domain.

## Key entry files

- `auth.ts`: session verification gate used by nearly every admin API route
- `os.ts`: main command-center snapshot builder
- `statistics.ts`: shared stats primitives used by the stats dashboard and comparison flows

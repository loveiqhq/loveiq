# app/admin/

Authenticated admin page routes.

## What belongs here

- Thin `page.tsx` wrappers for `/admin/*` routes
- `layout.tsx` for the shared admin shell
- Auth callback plumbing under `auth/`

## What does not belong here

- Dashboard UI implementations: use [`components/admin/AGENT_README.md`](../../components/admin/AGENT_README.md)
- Admin API handlers: use [`../api/admin/AGENT_README.md`](../api/admin/AGENT_README.md)
- Server-side admin data assembly: use [`../../lib/admin/AGENT_README.md`](../../lib/admin/AGENT_README.md)

## How to navigate

Start with the domain doc in [`../../docs/admin/domains/AGENT_README.md`](../../docs/admin/domains/AGENT_README.md), then jump back into this route tree only for the page wrapper you need.

| Domain                                | Page routes to start with                                                                                                                                                                                                                                                                                                                                     | Canonical lookup doc                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Command center and shell              | `page.tsx`, `command-center/page.tsx`, `operating-review/page.tsx`, `strategy-lead/page.tsx`, `product-lead/page.tsx`, `growth-lead/page.tsx`, `tech-lead/page.tsx`, `org/page.tsx`, `goals/page.tsx`, `tools/page.tsx`, `activity/page.tsx`, `changelog/page.tsx`, `tags/page.tsx`, `auto-tag-rules/page.tsx`                                                | [`docs/admin/domains/command-center.md`](../../docs/admin/domains/command-center.md) |
| Submissions and moderation            | `submissions/page.tsx`, `submissions/[id]/page.tsx`, `submissions/compare/page.tsx`, `submissions/partial/[sessionId]/page.tsx`, `survey-status/page.tsx`                                                                                                                                                                                                     | [`docs/admin/domains/submissions.md`](../../docs/admin/domains/submissions.md)       |
| Scoring and survey intelligence       | `answers/page.tsx`, `archetypes/**/page.tsx`, `language-analytics/page.tsx`, `product-kpis/page.tsx`, `profiles/page.tsx`, `question-effectiveness/page.tsx`, `question-lifecycle/page.tsx`, `reports/page.tsx`, `report-builder/page.tsx`, `risk-score/page.tsx`, `scorecard/page.tsx`, `scoring/page.tsx`, `text-analysis/page.tsx`, `abandonment/page.tsx` | [`docs/admin/domains/scoring.md`](../../docs/admin/domains/scoring.md)               |
| Growth, funnel, and revenue analytics | `comparisons/page.tsx`, `funnels/page.tsx`, `growth/page.tsx`, `invite-network/page.tsx`, `journey/page.tsx`, `pipeline/page.tsx`, `pulse/page.tsx`, `replay/page.tsx`, `retention/page.tsx`, `revenue/page.tsx`                                                                                                                                              | [`docs/admin/domains/growth.md`](../../docs/admin/domains/growth.md)                 |
| Research and strategy workspaces      | `benchmarks/page.tsx`, `experiments/page.tsx`, `predictions/page.tsx`, `research/page.tsx`, `strategy/page.tsx`                                                                                                                                                                                                                                               | [`docs/admin/domains/research.md`](../../docs/admin/domains/research.md)             |
| Health and operational diagnostics    | `health/page.tsx`                                                                                                                                                                                                                                                                                                                                             | [`docs/admin/domains/health.md`](../../docs/admin/domains/health.md)                 |

## Key entry files

- `layout.tsx`: admin shell wrapper
- `page.tsx`: default `/admin` landing route
- `login/page.tsx`: public admin sign-in page
- `auth/callback/route.ts`: magic-link callback

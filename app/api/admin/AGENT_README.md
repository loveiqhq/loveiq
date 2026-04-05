# app/api/admin/

Authenticated admin API route handlers.

## What belongs here

- `route.ts` handlers under `/api/admin/*`
- Route-specific validation, auth gating, and response shaping

## What does not belong here

- Shared auth and data helpers: use [`../../../lib/admin/AGENT_README.md`](../../../lib/admin/AGENT_README.md)
- Admin UI components: use [`../../../components/admin/AGENT_README.md`](../../../components/admin/AGENT_README.md)
- High-level route inventory prose: use [`../../../docs/admin-api.md`](../../../docs/admin-api.md)

## How to navigate

Use the domain docs in [`../../../docs/admin/domains/AGENT_README.md`](../../../docs/admin/domains/AGENT_README.md) when you know the task but not the route family.

| Domain                                | Route families to start with                                                                                                                                                                                                                                                                                                  | Canonical lookup doc                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Command center and shell              | `login`, `logout`, `org`, `os`, `lead/[role]`, `actions`, `views`, `command`, `goals`                                                                                                                                                                                                                                         | [`docs/admin/domains/command-center.md`](../../../docs/admin/domains/command-center.md) |
| Submissions and moderation            | `submissions/**`, `export`, `export-presets`, `survey-status`, `tags`, `tag-rules`, `comments`                                                                                                                                                                                                                                | [`docs/admin/domains/submissions.md`](../../../docs/admin/domains/submissions.md)       |
| Scoring and survey intelligence       | `abandonment`, `answers/distribution`, `archetypes/**`, `language-analytics`, `product-kpis/**`, `profiles`, `question-effectiveness`, `question-lifecycle`, `report-snapshot`, `reports/engagement`, `risk-score`, `scorecard`, `scoring/comparison`, `search/semantic`, `text-analysis`                                     | [`docs/admin/domains/scoring.md`](../../../docs/admin/domains/scoring.md)               |
| Growth, funnel, and revenue analytics | `comparisons/**`, `funnels/**`, `growth/**`, `growth-opportunities`, `growth-signal-intelligence`, `invite-network`, `journey`, `pipeline`, `pulse/**`, `retention`, `revenue/**`                                                                                                                                             | [`docs/admin/domains/growth.md`](../../../docs/admin/domains/growth.md)                 |
| Research and strategy workspaces      | `benchmarks`, `decision-intelligence`, `executive-memo`, `experiment-strategy`, `experiments`, `explanations`, `graph`, `insights`, `intelligence`, `knowledge`, `lifecycle-intelligence`, `metric-*`, `network-strategy-intelligence`, `predictions`, `research-*`, `segments`, `simulations`, `strategy*`                   | [`docs/admin/domains/research.md`](../../../docs/admin/domains/research.md)             |
| Health and operational diagnostics    | `access-risk`, `activity`, `alerts`, `annotations`, `audit`, `dashboard-subscriptions`, `digest`, `drift-detector`, `health/**`, `incidents/correlation`, `optimization-intelligence`, `path-intelligence`, `release-impact`, `resilience-intelligence`, `reviews`, `tech-intelligence`, `what-changed`, `workspace-maturity` | [`docs/admin/domains/health.md`](../../../docs/admin/domains/health.md)                 |

## Key entry files

- `login/route.ts`: public admin-login trigger
- `logout/route.ts`: session teardown
- `os/route.ts`: command-center snapshot
- `stats/route.ts`: dedicated stats feed used by the stats dashboard component

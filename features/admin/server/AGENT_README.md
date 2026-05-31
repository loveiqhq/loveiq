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

| Domain                                | Core files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Canonical lookup doc                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Access, auth, and shared plumbing     | `auth.ts`, `roles.ts`, `audit.ts`, `format.ts`, `supabase.ts`, `supabase-server.ts`, `data-subject.ts`                                                                                                                                                                                                                                                                                                                                                                                                                            | [`docs/admin/domains/command-center.md`](../../../docs/admin/domains/command-center.md) |
| Command center and operating system   | `os.ts`, `os-types.ts`, `knowledge.ts`, `knowledge-types.ts`, `graph.ts`, `graph-types.ts`, `comments.ts`, `dashboard-subscriptions.ts`, `workflow-tags.ts`                                                                                                                                                                                                                                                                                                                                                                       | [`docs/admin/domains/command-center.md`](../../../docs/admin/domains/command-center.md) |
| Submissions and moderation            | `survey-partials.ts`, `segment-preview.ts`, `segment-evaluator.ts`, `segment-migration.ts`, `drilldowns.ts`, `delete-submission.ts`, `test-submission.ts`                                                                                                                                                                                                                                                                                                                                                                         | [`docs/admin/domains/submissions.md`](../../../docs/admin/domains/submissions.md)       |
| Scoring and survey intelligence       | `statistics.ts`, `submission-scoring.ts`, `forecasting.ts`, `question-effectiveness.ts`, `product-adoption.ts`, `product-experience-health.ts`, `product-issue-radar.ts`, `product-issue-types.ts`, `cohort-comparison.ts`, `channel-efficiency.ts`                                                                                                                                                                                                                                                                               | [`docs/admin/domains/scoring.md`](../../../docs/admin/domains/scoring.md)               |
| Growth, funnel, and revenue analytics | `growth-control-tower.ts`, `growth-opportunities.ts`, `growth-signal-intelligence.ts`, `conversion-leak-debugger.ts`, `creative-intelligence.ts`, `geo-language-expansion.ts`, `recovery-playbook.ts`, `referral-intelligence.ts`, `replay-paths.ts`, `release-impact.ts`, `value-realization.ts`                                                                                                                                                                                                                                 | [`docs/admin/domains/growth.md`](../../../docs/admin/domains/growth.md)                 |
| Research and strategy workspaces      | `strategy.ts`, `strategy-planning.ts`, `strategy-intelligence.ts`, `decision-intelligence.ts`, `experiment-registry.ts`, `experiment-strategy.ts`, `explanations.ts`, `intelligence.ts`, `intelligence-types.ts`, `lifecycle-intelligence.ts`, `metric-library.ts`, `metric-registry.ts`, `metric-status.ts`, `metric-impact.ts`, `metric-lineage.ts`, `network-strategy-intelligence.ts`, `research-intelligence.ts`, `research-repository.ts`, `research-taxonomy.ts`, `simulations.ts`, `simulation-types.ts`, `next-level.ts` | [`docs/admin/domains/research.md`](../../../docs/admin/domains/research.md)             |
| Health and operational diagnostics    | `alerts.ts`, `health.ts`, `incident-correlation.ts`, `incident-correlation-types.ts`, `drift-detector.ts`, `optimization-intelligence.ts`, `path-intelligence.ts`, `resilience-intelligence.ts`, `reviews.ts`, `tech-intelligence.ts`, `workspace-maturity.ts`, `digest-metrics.ts`, `digest-product.ts`, `digest-tech.ts`, `digest-leak-scoring.ts`, `digest-recommendations.ts`, `digest-recommendation-compare.ts`, `digest-recommendation-history.ts`                                                                         | [`docs/admin/domains/health.md`](../../../docs/admin/domains/health.md)                 |

Subdirectories: `emails/` (admin magic-link template), `intelligence/`, and `strategy/` hold helper/type modules grouped with their domain.

## Key entry files

- `auth.ts`: session verification gate used by nearly every admin API route
- `os.ts`: main command-center snapshot builder
- `statistics.ts`: shared stats primitives used by the stats dashboard and comparison flows

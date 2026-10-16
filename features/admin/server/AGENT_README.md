# features/admin/server/

Admin-only server code. Since 16 Oct 2026 the admin is AP-Analytics only, and the modules only the old admin pages used were removed. What is left serves AP, the remaining admin API routes, the Slack digest crons and the company brain.

## What belongs here

- Auth and role checks for the admin surface
- Supabase helpers for admin route handlers and server components
- AP-Analytics' figures under `ap/`
- Builders the digest crons and the brain import
- Admin transactional email templates under `emails/`

## What does not belong here

- Route handlers: use [`app/api/admin/AGENT_README.md`](../../../app/api/admin/AGENT_README.md)
- Admin UI composition: use [`features/admin/ui/AGENT_README.md`](../ui/AGENT_README.md)
- Global utilities shared outside admin: use [`shared/AGENT_README.md`](../../../shared/AGENT_README.md)

## How to navigate

When the task starts from product language instead of a file path, begin with [`docs/admin/domains/AGENT_README.md`](../../../docs/admin/domains/AGENT_README.md).

| Area                        | Core files                                                                                                                                                                                                                                                                                          | Used by                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Sign-in, roles and audit    | `auth.ts`, `roles.ts`, `audit.ts`, `supabase.ts`, `supabase-server.ts`, `emails/admin-magic-link.ts`                                                                                                                                                                                                | The admin routes and the sign-in callback; `supabase.ts` is also used well beyond the admin                  |
| AP-Analytics                | `ap/`, with `format.ts`, `statistics.ts`, `team-export.ts` and `dropoff-weekly.ts`                                                                                                                                                                                                                  | `/api/admin/ap/*`                                                                                            |
| One submission and GDPR     | `delete-submission.ts`, `data-subject.ts`                                                                                                                                                                                                                                                           | `/api/admin/submissions/[id]`, `/api/admin/data-subject` ([map](../../../docs/admin/domains/submissions.md)) |
| Slack digests and KPI crons | `digest-metrics.ts`, `conversion-digest.ts`, `digest-product.ts`, `digest-tech.ts`, `dropoff-report.ts`, `dropoff-weekly.ts`, `dropoff-notion.ts`, `kpi-weekly.ts`, `kpi-notion.ts`, `notion-row-sync.ts`, `alerts.ts`, `health.ts`, `friction-metrics.ts`, and the helpers only they reach (below) | `app/api/cron/*`, `/api/admin/digest-image/[kind]`                                                           |
| Company brain               | `experiment-readouts.ts`, `reader-sessions.ts`, and from the rows above `health.ts`, `kpi-notion.ts`, `dropoff-notion.ts`, `statistics.ts`, `team-export.ts`                                                                                                                                        | `features/brain/server/`                                                                                     |
| Team data export            | `team-export.ts`, `test-submission.ts`                                                                                                                                                                                                                                                              | The `team-export` cron (which the brain's `export_all_data` starts), the AP explorer's masking               |

The helpers reached only through the modules above (`digest-metrics.ts`, `alerts.ts`, `health.ts`): `channel-efficiency.ts`, `conversion-leak-debugger.ts`, `digest-leak-scoring.ts`, `digest-recommendations.ts`, `digest-recommendation-compare.ts`, `digest-recommendation-history.ts`, `drilldowns.ts`, `forecasting.ts`, `metric-library.ts`, `next-level.ts`, `os-types.ts`, `segment-evaluator.ts`, `strategy.ts` (with `strategy/`), `value-realization.ts`, `workflow-tags.ts`.

## Key entry files

- `auth.ts`: `verifyAdminSession()`, the session gate every signed-in admin route uses (AP's through `ap/route-guard.ts`)
- `statistics.ts`: shared stats primitives used by AP's traffic page, the conversion digest, the A/B readouts and the brain
- `experiment-readouts.ts`: the A/B readouts behind the brain's `experiments` tool (the old admin's A/B overview used them until 16 Oct 2026). Staff test runs are left out (`isStaffEmail`, the rule that sets `payment.is_test`), as the digests' funnel functions do since migration `20261006230000`; a sale is a succeeded, non-test payment above €0, counted at what was paid. The file explains the window each test is read over
- `ap/`: AP-Analytics (`/admin/ap`): `facts.ts` reads `ap_facts` (`fetchFactsFor` also marks each reader new or returning, through `posthog.ts` `markVisitors`, when the New & returning filter is set), `metrics.ts` and `filters.ts` count and slice it, one builder per page (`focus.ts` for the Dashboard, `assessment.ts`, `traffic.ts` with its arithmetic in `traffic-math.ts`, `landing.ts`, `survey-page.ts`, `report-page.ts`, which also reads `ap_report_extras`, `payment.ts`; `survey.ts` reads `ap_survey_steps`, `answers.ts` reads `ap_question_answers`), `common.ts` for what the pages share, `ads.ts` for Google Ads per campaign and keyword, `posthog.ts` for what only PostHog sees, `catalog.ts` and `explorer.ts` for the data catalog and the masked raw data explorer, `route-guard.ts` for `apGuard`

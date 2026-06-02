# Admin API Reference

> Owner: CODEOWNERS default
> Last verified: 2026-05-31
> Verified against: `app/api/admin/**/route.ts`, `features/admin/server/roles.ts`

This document catalogs the authenticated admin API surface under `/api/admin/*`.

Admin shell, sidebar, and dashboard composition details live in [admin-dashboard.md](admin-dashboard.md).
Admin lookup by product domain lives in [docs/admin/AGENT_README.md](admin/AGENT_README.md).

## Access Model

- Most routes require a valid Supabase Auth admin session checked through `verifyAdminSession()`.
- Read routes typically require `viewer` access or higher.
- Mutating routes also require CSRF validation.
- Some write routes apply stricter role checks by method or action payload.
- `/api/admin/login` is the public entrypoint for requesting an allowlisted magic link.

Canonical role hierarchy from [`features/admin/server/roles.ts`](../features/admin/server/roles.ts):

- `viewer`
- `editor`
- `admin`

## Route Inventory

### Access and Admin Shell

| Route                      | Methods | Minimum access                                                    | Source                                                                            |
| -------------------------- | ------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/api/admin/login`         | `POST`  | Public route with CSRF, rate limiting, and allowlist checks       | [`app/api/admin/login/route.ts`](../app/api/admin/login/route.ts)                 |
| `/api/admin/logout`        | `POST`  | Authenticated session logout with CSRF                            | [`app/api/admin/logout/route.ts`](../app/api/admin/logout/route.ts)               |
| `/api/admin/org`           | `GET`   | `viewer+`                                                         | [`app/api/admin/org/route.ts`](../app/api/admin/org/route.ts)                     |
| `/api/admin/os`            | `GET`   | `viewer+`                                                         | [`app/api/admin/os/route.ts`](../app/api/admin/os/route.ts)                       |
| `/api/admin/lead/[role]`   | `GET`   | `viewer+` for `strategy`, `product`, `growth`; `admin` for `tech` | [`app/api/admin/lead/[role]/route.ts`](../app/api/admin/lead/[role]/route.ts)     |
| `/api/admin/health/status` | `GET`   | `admin`                                                           | [`app/api/admin/health/status/route.ts`](../app/api/admin/health/status/route.ts) |
| `/api/admin/health/logs`   | `GET`   | `admin`                                                           | [`app/api/admin/health/logs/route.ts`](../app/api/admin/health/logs/route.ts)     |

### Submissions, Export, and Admin Views

| Route                                           | Methods              | Minimum access                                          | Source                                                                                                                      |
| ----------------------------------------------- | -------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/stats`                              | `GET`                | `viewer+`                                               | [`app/api/admin/stats/route.ts`](../app/api/admin/stats/route.ts)                                                           |
| `/api/admin/submissions`                        | `GET`                | `viewer+`                                               | [`app/api/admin/submissions/route.ts`](../app/api/admin/submissions/route.ts)                                               |
| `/api/admin/submissions/[id]`                   | `GET, PATCH, DELETE` | `GET viewer+`, `PATCH editor+`, `DELETE admin`          | [`app/api/admin/submissions/[id]/route.ts`](../app/api/admin/submissions/[id]/route.ts)                                     |
| `/api/admin/submissions/[id]/notes`             | `GET, POST`          | `GET viewer+`, `POST editor+`                           | [`app/api/admin/submissions/[id]/notes/route.ts`](../app/api/admin/submissions/[id]/notes/route.ts)                         |
| `/api/admin/submissions/[id]/notes/[noteId]`    | `PATCH, DELETE`      | `PATCH editor+`, `DELETE admin`                         | [`app/api/admin/submissions/[id]/notes/[noteId]/route.ts`](../app/api/admin/submissions/[id]/notes/[noteId]/route.ts)       |
| `/api/admin/submissions/[id]/timeline`          | `GET`                | `viewer+`                                               | [`app/api/admin/submissions/[id]/timeline/route.ts`](../app/api/admin/submissions/[id]/timeline/route.ts)                   |
| `/api/admin/submissions/[id]/funnel`            | `GET`                | `viewer+`                                               | [`app/api/admin/submissions/[id]/funnel/route.ts`](../app/api/admin/submissions/[id]/funnel/route.ts)                       |
| `/api/admin/submissions/[id]/grant-call-coupon` | `POST`               | `editor+`                                               | [`app/api/admin/submissions/[id]/grant-call-coupon/route.ts`](../app/api/admin/submissions/[id]/grant-call-coupon/route.ts) |
| `/api/admin/submissions/bulk`                   | `PATCH`              | `editor+`                                               | [`app/api/admin/submissions/bulk/route.ts`](../app/api/admin/submissions/bulk/route.ts)                                     |
| `/api/admin/submissions/bulk-delete`            | `POST`               | `admin`                                                 | [`app/api/admin/submissions/bulk-delete/route.ts`](../app/api/admin/submissions/bulk-delete/route.ts)                       |
| `/api/admin/submissions/recover`                | `POST`               | `editor+`                                               | [`app/api/admin/submissions/recover/route.ts`](../app/api/admin/submissions/recover/route.ts)                               |
| `/api/admin/submissions/partial/[sessionId]`    | `GET`                | `viewer+`                                               | [`app/api/admin/submissions/partial/[sessionId]/route.ts`](../app/api/admin/submissions/partial/[sessionId]/route.ts)       |
| `/api/admin/export`                             | `GET`                | `admin`                                                 | [`app/api/admin/export/route.ts`](../app/api/admin/export/route.ts)                                                         |
| `/api/admin/export-presets`                     | `GET, POST`          | `GET viewer+`, `POST editor+`                           | [`app/api/admin/export-presets/route.ts`](../app/api/admin/export-presets/route.ts)                                         |
| `/api/admin/export-presets/[id]`                | `DELETE`             | `editor+`                                               | [`app/api/admin/export-presets/[id]/route.ts`](../app/api/admin/export-presets/[id]/route.ts)                               |
| `/api/admin/survey-status`                      | `GET, PATCH`         | `GET viewer+`, `PATCH admin`                            | [`app/api/admin/survey-status/route.ts`](../app/api/admin/survey-status/route.ts)                                           |
| `/api/admin/views`                              | `GET, POST`          | `GET viewer+`, `POST editor+`                           | [`app/api/admin/views/route.ts`](../app/api/admin/views/route.ts)                                                           |
| `/api/admin/views/[id]`                         | `DELETE`             | `editor+`                                               | [`app/api/admin/views/[id]/route.ts`](../app/api/admin/views/[id]/route.ts)                                                 |
| `/api/admin/tags`                               | `GET, POST`          | `GET viewer+`, `POST editor+`                           | [`app/api/admin/tags/route.ts`](../app/api/admin/tags/route.ts)                                                             |
| `/api/admin/tag-rules`                          | `GET, POST`          | `GET viewer+`, `POST editor+/admin depending on action` | [`app/api/admin/tag-rules/route.ts`](../app/api/admin/tag-rules/route.ts)                                                   |

### Workflow, Registries, and Collaboration

| Route                                     | Methods            | Minimum access                                                                | Source                                                                                                          |
| ----------------------------------------- | ------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/api/admin/actions`                      | `GET, POST`        | `GET viewer+`, `POST editor+`                                                 | [`app/api/admin/actions/route.ts`](../app/api/admin/actions/route.ts)                                           |
| `/api/admin/actions/[id]`                 | `PATCH`            | `editor+`                                                                     | [`app/api/admin/actions/[id]/route.ts`](../app/api/admin/actions/[id]/route.ts)                                 |
| `/api/admin/alerts`                       | `GET, POST`        | `GET viewer+`, `POST editor+`                                                 | [`app/api/admin/alerts/route.ts`](../app/api/admin/alerts/route.ts)                                             |
| `/api/admin/alerts/[id]`                  | `PATCH`            | `editor+`                                                                     | [`app/api/admin/alerts/[id]/route.ts`](../app/api/admin/alerts/[id]/route.ts)                                   |
| `/api/admin/annotations`                  | `GET, POST`        | `GET viewer+`, `POST editor+`                                                 | [`app/api/admin/annotations/route.ts`](../app/api/admin/annotations/route.ts)                                   |
| `/api/admin/annotations/[id]`             | `DELETE`           | `editor+`                                                                     | [`app/api/admin/annotations/[id]/route.ts`](../app/api/admin/annotations/[id]/route.ts)                         |
| `/api/admin/benchmarks`                   | `GET, POST`        | `GET viewer+`, `POST editor+`                                                 | [`app/api/admin/benchmarks/route.ts`](../app/api/admin/benchmarks/route.ts)                                     |
| `/api/admin/changelog`                    | `GET, POST, PATCH` | `GET viewer+`, `POST/PATCH editor+`                                           | [`app/api/admin/changelog/route.ts`](../app/api/admin/changelog/route.ts)                                       |
| `/api/admin/changelog/[id]`               | `PATCH, DELETE`    | `PATCH editor+`, `DELETE admin`                                               | [`app/api/admin/changelog/[id]/route.ts`](../app/api/admin/changelog/[id]/route.ts)                             |
| `/api/admin/comments`                     | `GET, POST`        | `GET viewer+`, `POST editor+`                                                 | [`app/api/admin/comments/route.ts`](../app/api/admin/comments/route.ts)                                         |
| `/api/admin/comments/[id]`                | `PATCH, DELETE`    | `PATCH editor+`, `DELETE admin`                                               | [`app/api/admin/comments/[id]/route.ts`](../app/api/admin/comments/[id]/route.ts)                               |
| `/api/admin/dashboard-subscriptions`      | `GET, POST`        | `GET viewer+`, `POST editor+`                                                 | [`app/api/admin/dashboard-subscriptions/route.ts`](../app/api/admin/dashboard-subscriptions/route.ts)           |
| `/api/admin/dashboard-subscriptions/[id]` | `PATCH`            | `editor+`                                                                     | [`app/api/admin/dashboard-subscriptions/[id]/route.ts`](../app/api/admin/dashboard-subscriptions/[id]/route.ts) |
| `/api/admin/experiments`                  | `GET, POST`        | `GET viewer+`, `POST editor+`                                                 | [`app/api/admin/experiments/route.ts`](../app/api/admin/experiments/route.ts)                                   |
| `/api/admin/goals`                        | `GET, POST`        | `GET viewer+`, `POST editor+`; delete action inside `POST` requires `admin`   | [`app/api/admin/goals/route.ts`](../app/api/admin/goals/route.ts)                                               |
| `/api/admin/investigations`               | `GET, POST`        | `GET viewer+`, `POST editor+`; delete action inside `POST` requires `admin`   | [`app/api/admin/investigations/route.ts`](../app/api/admin/investigations/route.ts)                             |
| `/api/admin/metric-registry`              | `GET, POST`        | `GET viewer+`, `POST editor+`                                                 | [`app/api/admin/metric-registry/route.ts`](../app/api/admin/metric-registry/route.ts)                           |
| `/api/admin/metric-status`                | `GET, POST`        | `GET viewer+`, `POST editor+`                                                 | [`app/api/admin/metric-status/route.ts`](../app/api/admin/metric-status/route.ts)                               |
| `/api/admin/research-repository`          | `GET, POST`        | `GET viewer+`, `POST editor+`                                                 | [`app/api/admin/research-repository/route.ts`](../app/api/admin/research-repository/route.ts)                   |
| `/api/admin/research-repository/[id]`     | `PATCH`            | `editor+`                                                                     | [`app/api/admin/research-repository/[id]/route.ts`](../app/api/admin/research-repository/[id]/route.ts)         |
| `/api/admin/research-taxonomy`            | `GET, POST`        | `GET viewer+`, `POST editor+/admin depending on action`                       | [`app/api/admin/research-taxonomy/route.ts`](../app/api/admin/research-taxonomy/route.ts)                       |
| `/api/admin/reviews`                      | `GET, POST`        | `GET viewer+`, `POST editor+`                                                 | [`app/api/admin/reviews/route.ts`](../app/api/admin/reviews/route.ts)                                           |
| `/api/admin/reviews/[id]`                 | `PATCH`            | `editor+`                                                                     | [`app/api/admin/reviews/[id]/route.ts`](../app/api/admin/reviews/[id]/route.ts)                                 |
| `/api/admin/segments`                     | `GET, POST`        | `GET viewer+`, `POST editor+`; update/delete actions are owner-or-admin gated | [`app/api/admin/segments/route.ts`](../app/api/admin/segments/route.ts)                                         |
| `/api/admin/segments/deltas`              | `GET`              | `viewer+`                                                                     | [`app/api/admin/segments/deltas/route.ts`](../app/api/admin/segments/deltas/route.ts)                           |
| `/api/admin/strategy-planning`            | `GET, POST`        | `GET viewer+`, `POST editor+`                                                 | [`app/api/admin/strategy-planning/route.ts`](../app/api/admin/strategy-planning/route.ts)                       |

### Survey, Product, and Scoring Analytics

| Route                                       | Methods | Minimum access | Source                                                                                                              |
| ------------------------------------------- | ------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/abandonment`                    | `GET`   | `viewer+`      | [`app/api/admin/abandonment/route.ts`](../app/api/admin/abandonment/route.ts)                                       |
| `/api/admin/anomalies`                      | `GET`   | `viewer+`      | [`app/api/admin/anomalies/route.ts`](../app/api/admin/anomalies/route.ts)                                           |
| `/api/admin/answers/distribution`           | `GET`   | `viewer+`      | [`app/api/admin/answers/distribution/route.ts`](../app/api/admin/answers/distribution/route.ts)                     |
| `/api/admin/archetypes`                     | `GET`   | `viewer+`      | [`app/api/admin/archetypes/route.ts`](../app/api/admin/archetypes/route.ts)                                         |
| `/api/admin/archetypes/compare`             | `GET`   | `viewer+`      | [`app/api/admin/archetypes/compare/route.ts`](../app/api/admin/archetypes/compare/route.ts)                         |
| `/api/admin/archetypes/[slug]`              | `GET`   | `viewer+`      | [`app/api/admin/archetypes/[slug]/route.ts`](../app/api/admin/archetypes/[slug]/route.ts)                           |
| `/api/admin/language-analytics`             | `GET`   | `viewer+`      | [`app/api/admin/language-analytics/route.ts`](../app/api/admin/language-analytics/route.ts)                         |
| `/api/admin/product-kpis`                   | `GET`   | `viewer+`      | [`app/api/admin/product-kpis/route.ts`](../app/api/admin/product-kpis/route.ts)                                     |
| `/api/admin/product-kpis/adoption`          | `GET`   | `viewer+`      | [`app/api/admin/product-kpis/adoption/route.ts`](../app/api/admin/product-kpis/adoption/route.ts)                   |
| `/api/admin/product-kpis/discrimination`    | `GET`   | `viewer+`      | [`app/api/admin/product-kpis/discrimination/route.ts`](../app/api/admin/product-kpis/discrimination/route.ts)       |
| `/api/admin/product-kpis/experience-health` | `GET`   | `viewer+`      | [`app/api/admin/product-kpis/experience-health/route.ts`](../app/api/admin/product-kpis/experience-health/route.ts) |
| `/api/admin/product-kpis/issues`            | `GET`   | `viewer+`      | [`app/api/admin/product-kpis/issues/route.ts`](../app/api/admin/product-kpis/issues/route.ts)                       |
| `/api/admin/profiles`                       | `GET`   | `viewer+`      | [`app/api/admin/profiles/route.ts`](../app/api/admin/profiles/route.ts)                                             |
| `/api/admin/question-effectiveness`         | `GET`   | `viewer+`      | [`app/api/admin/question-effectiveness/route.ts`](../app/api/admin/question-effectiveness/route.ts)                 |
| `/api/admin/question-lifecycle`             | `GET`   | `viewer+`      | [`app/api/admin/question-lifecycle/route.ts`](../app/api/admin/question-lifecycle/route.ts)                         |
| `/api/admin/report-snapshot`                | `GET`   | `viewer+`      | [`app/api/admin/report-snapshot/route.ts`](../app/api/admin/report-snapshot/route.ts)                               |
| `/api/admin/replay`                         | `GET`   | `viewer+`      | [`app/api/admin/replay/route.ts`](../app/api/admin/replay/route.ts)                                                 |
| `/api/admin/reports/engagement`             | `GET`   | `viewer+`      | [`app/api/admin/reports/engagement/route.ts`](../app/api/admin/reports/engagement/route.ts)                         |
| `/api/admin/risk-score`                     | `GET`   | `viewer+`      | [`app/api/admin/risk-score/route.ts`](../app/api/admin/risk-score/route.ts)                                         |
| `/api/admin/scorecard`                      | `GET`   | `viewer+`      | [`app/api/admin/scorecard/route.ts`](../app/api/admin/scorecard/route.ts)                                           |
| `/api/admin/scoring/comparison`             | `GET`   | `viewer+`      | [`app/api/admin/scoring/comparison/route.ts`](../app/api/admin/scoring/comparison/route.ts)                         |
| `/api/admin/search/semantic`                | `GET`   | `viewer+`      | [`app/api/admin/search/semantic/route.ts`](../app/api/admin/search/semantic/route.ts)                               |
| `/api/admin/text-analysis`                  | `GET`   | `viewer+`      | [`app/api/admin/text-analysis/route.ts`](../app/api/admin/text-analysis/route.ts)                                   |

### Growth, Funnel, Journey, and Revenue Analytics

| Route                                      | Methods             | Minimum access                    | Source                                                                                                            |
| ------------------------------------------ | ------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/api/admin/analytics/core-kpis`           | `GET`               | `viewer+`                         | [`app/api/admin/analytics/core-kpis/route.ts`](../app/api/admin/analytics/core-kpis/route.ts)                     |
| `/api/admin/analytics/export`              | `GET`               | `admin`                           | [`app/api/admin/analytics/export/route.ts`](../app/api/admin/analytics/export/route.ts)                           |
| `/api/admin/analytics/marketing-spend`     | `GET, POST, DELETE` | `viewer+` (GET) / `admin` (write) | [`app/api/admin/analytics/marketing-spend/route.ts`](../app/api/admin/analytics/marketing-spend/route.ts)         |
| `/api/admin/comparisons/correlation`       | `GET`               | `viewer+`                         | [`app/api/admin/comparisons/correlation/route.ts`](../app/api/admin/comparisons/correlation/route.ts)             |
| `/api/admin/comparisons/segment`           | `GET`               | `viewer+`                         | [`app/api/admin/comparisons/segment/route.ts`](../app/api/admin/comparisons/segment/route.ts)                     |
| `/api/admin/comparisons/segment-migration` | `GET`               | `viewer+`                         | [`app/api/admin/comparisons/segment-migration/route.ts`](../app/api/admin/comparisons/segment-migration/route.ts) |
| `/api/admin/funnels/cohorts`               | `GET`               | `viewer+`                         | [`app/api/admin/funnels/cohorts/route.ts`](../app/api/admin/funnels/cohorts/route.ts)                             |
| `/api/admin/funnels/conversion`            | `GET`               | `viewer+`                         | [`app/api/admin/funnels/conversion/route.ts`](../app/api/admin/funnels/conversion/route.ts)                       |
| `/api/admin/funnels/impact-comparison`     | `GET`               | `viewer+`                         | [`app/api/admin/funnels/impact-comparison/route.ts`](../app/api/admin/funnels/impact-comparison/route.ts)         |
| `/api/admin/growth/acquisition-quality`    | `GET`               | `viewer+`                         | [`app/api/admin/growth/acquisition-quality/route.ts`](../app/api/admin/growth/acquisition-quality/route.ts)       |
| `/api/admin/growth/control-tower`          | `GET`               | `viewer+`                         | [`app/api/admin/growth/control-tower/route.ts`](../app/api/admin/growth/control-tower/route.ts)                   |
| `/api/admin/growth/creative-intelligence`  | `GET`               | `viewer+`                         | [`app/api/admin/growth/creative-intelligence/route.ts`](../app/api/admin/growth/creative-intelligence/route.ts)   |
| `/api/admin/growth/embed-performance`      | `GET`               | `viewer+`                         | [`app/api/admin/growth/embed-performance/route.ts`](../app/api/admin/growth/embed-performance/route.ts)           |
| `/api/admin/growth/geography`              | `GET`               | `viewer+`                         | [`app/api/admin/growth/geography/route.ts`](../app/api/admin/growth/geography/route.ts)                           |
| `/api/admin/growth/leak-debugger`          | `GET`               | `viewer+`                         | [`app/api/admin/growth/leak-debugger/route.ts`](../app/api/admin/growth/leak-debugger/route.ts)                   |
| `/api/admin/growth/recovery`               | `GET`               | `viewer+`                         | [`app/api/admin/growth/recovery/route.ts`](../app/api/admin/growth/recovery/route.ts)                             |
| `/api/admin/growth/referrals`              | `GET`               | `viewer+`                         | [`app/api/admin/growth/referrals/route.ts`](../app/api/admin/growth/referrals/route.ts)                           |
| `/api/admin/growth/value-attribution`      | `GET`               | `viewer+`                         | [`app/api/admin/growth/value-attribution/route.ts`](../app/api/admin/growth/value-attribution/route.ts)           |
| `/api/admin/growth/waitlist-conversion`    | `GET`               | `viewer+`                         | [`app/api/admin/growth/waitlist-conversion/route.ts`](../app/api/admin/growth/waitlist-conversion/route.ts)       |
| `/api/admin/growth-opportunities`          | `GET`               | `viewer+`                         | [`app/api/admin/growth-opportunities/route.ts`](../app/api/admin/growth-opportunities/route.ts)                   |
| `/api/admin/growth-signal-intelligence`    | `GET`               | `viewer+`                         | [`app/api/admin/growth-signal-intelligence/route.ts`](../app/api/admin/growth-signal-intelligence/route.ts)       |
| `/api/admin/invite-network`                | `GET`               | `viewer+`                         | [`app/api/admin/invite-network/route.ts`](../app/api/admin/invite-network/route.ts)                               |
| `/api/admin/journey`                       | `GET`               | `viewer+`                         | [`app/api/admin/journey/route.ts`](../app/api/admin/journey/route.ts)                                             |
| `/api/admin/pulse/activity`                | `GET`               | `viewer+`                         | [`app/api/admin/pulse/activity/route.ts`](../app/api/admin/pulse/activity/route.ts)                               |
| `/api/admin/pulse/at-risk`                 | `GET`               | `viewer+`                         | [`app/api/admin/pulse/at-risk/route.ts`](../app/api/admin/pulse/at-risk/route.ts)                                 |
| `/api/admin/retention`                     | `GET`               | `viewer+`                         | [`app/api/admin/retention/route.ts`](../app/api/admin/retention/route.ts)                                         |
| `/api/admin/revenue`                       | `GET`               | `admin`                           | [`app/api/admin/revenue/route.ts`](../app/api/admin/revenue/route.ts)                                             |
| `/api/admin/revenue/pricing-clusters`      | `GET`               | `admin`                           | [`app/api/admin/revenue/pricing-clusters/route.ts`](../app/api/admin/revenue/pricing-clusters/route.ts)           |
| `/api/admin/revenue/transactions`          | `GET`               | `admin`                           | [`app/api/admin/revenue/transactions/route.ts`](../app/api/admin/revenue/transactions/route.ts)                   |

### Strategy, Intelligence, and Operational Analytics

| Route                                      | Methods      | Minimum access | Source                                                                                                                                                                        |
| ------------------------------------------ | ------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/access-risk`                   | `GET`        | `admin`        | [`app/api/admin/access-risk/route.ts`](../app/api/admin/access-risk/route.ts)                                                                                                 |
| `/api/admin/activity`                      | `GET`        | `admin`        | [`app/api/admin/activity/route.ts`](../app/api/admin/activity/route.ts)                                                                                                       |
| `/api/admin/audit`                         | `GET`        | `admin`        | [`app/api/admin/audit/route.ts`](../app/api/admin/audit/route.ts)                                                                                                             |
| `/api/admin/data-subject`                  | `POST`       | `admin`        | GDPR Art. 15/17 DSAR endpoint (export / delete). See [`app/api/admin/data-subject/route.ts`](../app/api/admin/data-subject/route.ts).                                         |
| `/api/admin/system-flags`                  | `GET, PATCH` | `admin`        | Kill-switch flags (`survey_submissions`, `nurture_sequence`, `report_paywall_enforced`). See [`app/api/admin/system-flags/route.ts`](../app/api/admin/system-flags/route.ts). |
| `/api/admin/command`                       | `GET`        | `viewer+`      | [`app/api/admin/command/route.ts`](../app/api/admin/command/route.ts)                                                                                                         |
| `/api/admin/decision-intelligence`         | `GET`        | `viewer+`      | [`app/api/admin/decision-intelligence/route.ts`](../app/api/admin/decision-intelligence/route.ts)                                                                             |
| `/api/admin/digest`                        | `GET`        | `admin`        | [`app/api/admin/digest/route.ts`](../app/api/admin/digest/route.ts)                                                                                                           |
| `/api/admin/drift-detector`                | `GET`        | `viewer+`      | [`app/api/admin/drift-detector/route.ts`](../app/api/admin/drift-detector/route.ts)                                                                                           |
| `/api/admin/executive-memo`                | `GET`        | `viewer+`      | [`app/api/admin/executive-memo/route.ts`](../app/api/admin/executive-memo/route.ts)                                                                                           |
| `/api/admin/experiment-strategy`           | `GET`        | `viewer+`      | [`app/api/admin/experiment-strategy/route.ts`](../app/api/admin/experiment-strategy/route.ts)                                                                                 |
| `/api/admin/explanations`                  | `GET`        | `viewer+`      | [`app/api/admin/explanations/route.ts`](../app/api/admin/explanations/route.ts)                                                                                               |
| `/api/admin/graph`                         | `GET`        | `viewer+`      | [`app/api/admin/graph/route.ts`](../app/api/admin/graph/route.ts)                                                                                                             |
| `/api/admin/incidents/correlation`         | `GET`        | `viewer+`      | [`app/api/admin/incidents/correlation/route.ts`](../app/api/admin/incidents/correlation/route.ts)                                                                             |
| `/api/admin/insights`                      | `GET`        | `viewer+`      | [`app/api/admin/insights/route.ts`](../app/api/admin/insights/route.ts)                                                                                                       |
| `/api/admin/intelligence`                  | `GET`        | `viewer+`      | [`app/api/admin/intelligence/route.ts`](../app/api/admin/intelligence/route.ts)                                                                                               |
| `/api/admin/knowledge`                     | `GET`        | `viewer+`      | [`app/api/admin/knowledge/route.ts`](../app/api/admin/knowledge/route.ts)                                                                                                     |
| `/api/admin/lifecycle-intelligence`        | `GET`        | `viewer+`      | [`app/api/admin/lifecycle-intelligence/route.ts`](../app/api/admin/lifecycle-intelligence/route.ts)                                                                           |
| `/api/admin/metric-impact`                 | `GET`        | `viewer+`      | [`app/api/admin/metric-impact/route.ts`](../app/api/admin/metric-impact/route.ts)                                                                                             |
| `/api/admin/metric-lineage`                | `GET`        | `viewer+`      | [`app/api/admin/metric-lineage/route.ts`](../app/api/admin/metric-lineage/route.ts)                                                                                           |
| `/api/admin/network-strategy-intelligence` | `GET`        | `viewer+`      | [`app/api/admin/network-strategy-intelligence/route.ts`](../app/api/admin/network-strategy-intelligence/route.ts)                                                             |
| `/api/admin/optimization-intelligence`     | `GET`        | `viewer+`      | [`app/api/admin/optimization-intelligence/route.ts`](../app/api/admin/optimization-intelligence/route.ts)                                                                     |
| `/api/admin/path-intelligence`             | `GET`        | `viewer+`      | [`app/api/admin/path-intelligence/route.ts`](../app/api/admin/path-intelligence/route.ts)                                                                                     |
| `/api/admin/pipeline`                      | `GET`        | `viewer+`      | [`app/api/admin/pipeline/route.ts`](../app/api/admin/pipeline/route.ts)                                                                                                       |
| `/api/admin/predictions`                   | `GET`        | `viewer+`      | [`app/api/admin/predictions/route.ts`](../app/api/admin/predictions/route.ts)                                                                                                 |
| `/api/admin/release-impact`                | `GET`        | `viewer+`      | [`app/api/admin/release-impact/route.ts`](../app/api/admin/release-impact/route.ts)                                                                                           |
| `/api/admin/research-intelligence`         | `GET`        | `viewer+`      | [`app/api/admin/research-intelligence/route.ts`](../app/api/admin/research-intelligence/route.ts)                                                                             |
| `/api/admin/resilience-intelligence`       | `GET`        | `viewer+`      | [`app/api/admin/resilience-intelligence/route.ts`](../app/api/admin/resilience-intelligence/route.ts)                                                                         |
| `/api/admin/simulations`                   | `GET`        | `viewer+`      | [`app/api/admin/simulations/route.ts`](../app/api/admin/simulations/route.ts)                                                                                                 |
| `/api/admin/strategy`                      | `GET`        | `viewer+`      | [`app/api/admin/strategy/route.ts`](../app/api/admin/strategy/route.ts)                                                                                                       |
| `/api/admin/strategy-intelligence`         | `GET`        | `viewer+`      | [`app/api/admin/strategy-intelligence/route.ts`](../app/api/admin/strategy-intelligence/route.ts)                                                                             |
| `/api/admin/tech-intelligence`             | `GET`        | `viewer+`      | [`app/api/admin/tech-intelligence/route.ts`](../app/api/admin/tech-intelligence/route.ts)                                                                                     |
| `/api/admin/what-changed`                  | `GET`        | `viewer+`      | [`app/api/admin/what-changed/route.ts`](../app/api/admin/what-changed/route.ts)                                                                                               |
| `/api/admin/workspace-maturity`            | `GET`        | `viewer+`      | [`app/api/admin/workspace-maturity/route.ts`](../app/api/admin/workspace-maturity/route.ts)                                                                                   |

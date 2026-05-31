# features/admin/ui/

Admin UI surfaces, dashboards, shared controls, and tab groups.

## What belongs here

- Page-scale admin dashboards and panels
- Reusable admin-only controls, tables, and overlays
- Domain tab groups under subdirectories like `growth-tabs/` and `health-tabs/`
- Admin client hooks under `hooks/`

## What does not belong here

- Route wrappers: use [`app/admin/AGENT_README.md`](../../../app/admin/AGENT_README.md)
- API handlers: use [`app/api/admin/AGENT_README.md`](../../../app/api/admin/AGENT_README.md)
- Server-side query assembly and business logic: use [`features/admin/server/AGENT_README.md`](../server/AGENT_README.md)

## How to navigate

If you only know the product problem, start with [`docs/admin/domains/AGENT_README.md`](../../../docs/admin/domains/AGENT_README.md).

| Domain                                | Primary components                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Supporting subdirectories                                                                                         | Canonical lookup doc                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Command center and shell              | `CommandCenterDashboard.tsx`, `RoleCockpitDashboard.tsx`, `OperatingReviewDashboard.tsx`, `AdminSidebar.tsx`, `AdminHeader.tsx`, `AdminCommandPalette.tsx`, `GoalTracker.tsx`, `ChangelogDashboard.tsx`, `TagsDashboard.tsx`, `AutoTagRules.tsx`, `AdminToolsDashboard.tsx`, `OrgAdminDirectory.tsx`                                                                                                                                                                    | `tools-tabs/`, `activity-tabs/`                                                                                   | [`docs/admin/domains/command-center.md`](../../../docs/admin/domains/command-center.md) |
| Submissions and moderation            | `SubmissionBrowser.tsx`, `SubmissionDetail.tsx`, `SubmissionComparison.tsx`, `SubmissionTable.tsx`, `SurveyStatus.tsx`, `AdminCommentsThread.tsx`, `NotesSection.tsx`, `BulkActionBar.tsx`, `SavedViewsBar.tsx`                                                                                                                                                                                                                                                         | `answer-explorer/`                                                                                                | [`docs/admin/domains/submissions.md`](../../../docs/admin/domains/submissions.md)       |
| Scoring and survey intelligence       | `ScoringDashboard.tsx`, `ScorecardDashboard.tsx`, `ProductKpiDashboard.tsx`, `ReportsDashboard.tsx`, `ReportBuilder.tsx`, `RiskScoreDashboard.tsx`, `TextAnalysisDashboard.tsx`, `ProfilesDashboard.tsx`, `QuestionLifecyclePanel.tsx`, `QuestionEffectivenessDashboard.tsx`, `ArchetypeOverview.tsx`, `ArchetypeProfile.tsx`, `ArchetypeComparison.tsx`, `AnswerExplorer.tsx`, `LanguageAnalyticsDashboard.tsx`, `AbandonmentDashboard.tsx`, `AdminStatsDashboard.tsx` | `archetype-tabs/`, `kpi-tabs/`, `reports-tabs/`, `scorecard-tabs/`, `scoring-tabs/`, `text-analysis/`             | [`docs/admin/domains/scoring.md`](../../../docs/admin/domains/scoring.md)               |
| Growth, funnel, and revenue analytics | `GrowthDashboard.tsx`, `FunnelsDashboard.tsx`, `ComparisonsDashboard.tsx`, `PulseDashboard.tsx`, `ConversionPipeline.tsx`, `JourneyDashboard.tsx`, `ReplayDashboard.tsx`, `RetentionDashboard.tsx`, `RevenueDashboard.tsx`, `InviteNetworkDashboard.tsx`                                                                                                                                                                                                                | `comparison-tabs/`, `funnel-tabs/`, `growth-tabs/`, `journey/`, `pulse-tabs/`, `retention-tabs/`, `revenue-tabs/` | [`docs/admin/domains/growth.md`](../../../docs/admin/domains/growth.md)                 |
| Research and strategy workspaces      | `StrategyHubDashboard.tsx`, `PredictiveInsights.tsx`, `BenchmarkRegistry.tsx`, `ExperimentRegistry.tsx`, `ResearchRepositoryPanel.tsx`, `ResearchTaxonomyPanel.tsx`, `ResearchSynthesisWorkspace.tsx`, `InvestigationCasesPanel.tsx`, `AdminKnowledgePanel.tsx`, `EmbeddedIntelligencePanel.tsx`, `AdminSignalGraphPanel.tsx`, `AdminSimulationPanel.tsx`, `ResearchIntelligenceDashboard.tsx`, `UnknownUnknownsExplorer.tsx`                                           | none                                                                                                              | [`docs/admin/domains/research.md`](../../../docs/admin/domains/research.md)             |
| Health and operational diagnostics    | `HealthDashboard.tsx`, `WhatChangedOverlay.tsx`, `WeeklyDigestButton.tsx`, `AdminReviewRequestButton.tsx`                                                                                                                                                                                                                                                                                                                                                               | `health-tabs/`                                                                                                    | [`docs/admin/domains/health.md`](../../../docs/admin/domains/health.md)                 |

## Key entry files

- `AdminSidebar.tsx`: route grouping and navigation
- `CommandCenterDashboard.tsx`: active `/admin` landing surface
- `AdminStatsDashboard.tsx`: standalone stats-heavy dashboard component, not the default `/admin` page
- `hooks/useAdminFetch.ts`: common client-side admin data loader

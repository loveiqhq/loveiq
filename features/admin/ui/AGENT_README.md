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

| Domain                     | Primary components                                                                                                                                                                                              | Supporting subdirectories | Canonical lookup doc                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| Submissions and moderation | `SubmissionBrowser.tsx`, `SubmissionDetail.tsx`, `SubmissionComparison.tsx`, `SubmissionTable.tsx`, `SurveyStatus.tsx`, `AdminCommentsThread.tsx`, `NotesSection.tsx`, `BulkActionBar.tsx`, `SavedViewsBar.tsx` | `answer-explorer/`        | [`docs/admin/domains/submissions.md`](../../../docs/admin/domains/submissions.md) |

## Key entry files

- `AdminSidebar.tsx`: route grouping and navigation
- `CommandCenterDashboard.tsx`: active `/admin` landing surface
- `AdminStatsDashboard.tsx`: standalone stats-heavy dashboard component, not the default `/admin` page
- `hooks/useAdminFetch.ts`: common client-side admin data loader

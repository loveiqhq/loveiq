# features/admin/ui/

Admin UI. Since 16 Oct 2026 that is AP-Analytics (`ap/`) and the sign-in form; the old dark admin's dashboards, tab groups and controls were removed.

## What belongs here

- AP-Analytics under `ap/`: its shell, sidebar, filter bar and one component per page
- The sign-in form and the error box every AP page sits in
- Admin client hooks under `hooks/`

## What does not belong here

- Route wrappers: use [`app/admin/AGENT_README.md`](../../../app/admin/AGENT_README.md)
- API handlers: use [`app/api/admin/AGENT_README.md`](../../../app/api/admin/AGENT_README.md)
- Server-side query assembly and business logic: use [`features/admin/server/AGENT_README.md`](../server/AGENT_README.md)

## How to navigate

If you only know the product problem, start with [`docs/admin/domains/AGENT_README.md`](../../../docs/admin/domains/AGENT_README.md). Which component each page renders is in [`docs/admin-dashboard.md`](../../../docs/admin-dashboard.md).

## Key entry files

- `ap/`: AP-Analytics, its own light shell (`ApShell.tsx`, `ApSidebar.tsx`, `ApFilterBar.tsx`) and one component per page; the page list is `ap/nav.ts`, the building blocks are in `ap/kit.tsx`, and every chart's read-out (the card on hover, tap and arrow keys, and the shaded stretches with no figures) is in `ap/hover.tsx`. It imports only browser-safe server modules (`format`, `filters`, `days`, `explorer-spec`, `traffic-math`) and the others' types
- `AdminLoginForm.tsx`: the sign-in form at `/admin/login`, in AP's light design; it says why after the 30-minute idle sign-out
- `DashboardErrorBoundary.tsx`: wraps each AP page so a failing page shows its own error
- `hooks/useAdminFetch.ts`: the client-side data loader every AP page uses

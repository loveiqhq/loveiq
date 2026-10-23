# docs/admin/

Canonical admin lookup docs. Since 16 Oct 2026 the admin is AP-Analytics only (`/admin/ap`).

## What belongs here

- Admin-specific discovery docs that help an agent jump across routes, APIs, components, and server logic
- Domain maps under `domains/`

## What does not belong here

- Full API contracts: use [`docs/admin-api.md`](../admin-api.md)
- Page and shell reference: use [`docs/admin-dashboard.md`](../admin-dashboard.md)
- Historical plans: use [`../plans/`](../plans/) (the admin plans there describe the admin removed on 16 Oct 2026)

## How to use this directory

1. If you know the admin problem space but not the file, start with [`docs/admin/domains/AGENT_README.md`](domains/AGENT_README.md).
2. If you already know you need the full route catalog, use [`docs/admin-api.md`](../admin-api.md).
3. If you are working on the AP pages, their shell or the sign-in, use [`docs/admin-dashboard.md`](../admin-dashboard.md).

## Key entry files

- `domains/AGENT_README.md`: admin domain router
- `../admin-api.md`: route inventory
- `../admin-dashboard.md`: AP pages, shell and sign-in reference

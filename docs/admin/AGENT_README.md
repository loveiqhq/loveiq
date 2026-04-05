# docs/admin/

Canonical admin lookup docs.

## What belongs here

- Admin-specific discovery docs that help an agent jump across routes, APIs, components, and server logic
- Domain maps under `domains/`

## What does not belong here

- Full API contracts: use [`../admin-api.md`](../admin-api.md)
- Product-surface narrative docs: use [`../admin-dashboard.md`](../admin-dashboard.md)
- Historical plans: use [`../plans/`](../plans/)

## How to use this directory

1. If you know the admin problem space but not the file, start with [`domains/AGENT_README.md`](domains/AGENT_README.md).
2. If you already know you need the full route catalog, use [`../admin-api.md`](../admin-api.md).
3. If you are debugging shell behavior or the `/admin` landing experience, use [`../admin-dashboard.md`](../admin-dashboard.md).

## Key entry files

- `domains/AGENT_README.md`: admin domain router
- `../admin-api.md`: route inventory
- `../admin-dashboard.md`: shell and landing-surface reference

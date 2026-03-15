# supabase/

> For the full file listing, see the **Repo Map** in [CLAUDE.md](../CLAUDE.md).

## Purpose

Supabase project configuration and SQL migration files.

## Key Conventions

- Migration files are versioned with timestamps (e.g., `20260219000000_rate_limits.sql`). Always use a new timestamped file for schema changes -- never modify existing migrations.
- Migrations are applied via the Supabase dashboard or CLI, not by the application.
- The application accesses Supabase exclusively through the REST API -- there is no direct database client. Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only).

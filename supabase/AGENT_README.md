# supabase/

Supabase project configuration and SQL migration files.

## Key Conventions

- Migration files are versioned with timestamps (e.g., `20260307100000_normalized_schema.sql`). Always use a new timestamped file for schema changes -- never modify existing migrations.
- Migrations are applied via the Supabase dashboard or CLI, not by the application.
- The application accesses Supabase exclusively through the REST API -- there is no direct database client. Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only).
- **Rollback procedure**: see [`ROLLBACK.md`](./ROLLBACK.md). There are no `*.down.sql` files — rollback is either a branch reset (preferred) or a compensating timestamped migration.

## Migrations

Foundational anchors only — there are **130+** migrations. Run `npm run check:migrations` to verify
state, or browse `supabase/migrations/` for the full, authoritative list.

| Migration                                                     | Purpose                               |
| ------------------------------------------------------------- | ------------------------------------- |
| `20260307100000_normalized_schema.sql`                        | Normalized survey schema              |
| `20260307100001_seed_survey_data.sql`                         | Seed survey question data             |
| `20260307100002_submit_survey_rpc.sql`                        | Survey submission RPC function        |
| `20260308094839_add_duration_ms_and_update_submit_survey.sql` | Survey duration tracking + RPC update |
| `20260310164528_scoring_result.sql`                           | Scoring result storage                |
| `20260327205826_scoring_result_v5_columns.sql`                | V5 scoring columns                    |
| _… see `supabase/migrations/` for the complete list_          |                                       |

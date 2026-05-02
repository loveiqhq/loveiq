# supabase/

Supabase project configuration and SQL migration files.

## Key Conventions

- Migration files are versioned with timestamps (e.g., `20260219000000_rate_limits.sql`). Always use a new timestamped file for schema changes -- never modify existing migrations.
- Migrations are applied via the Supabase dashboard or CLI, not by the application.
- The application accesses Supabase exclusively through the REST API -- there is no direct database client. Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only).

## Migrations

| Migration                                 | Purpose                                  |
| ----------------------------------------- | ---------------------------------------- |
| `20260219000000_rate_limits.sql`          | Rate limiting table                      |
| `20260307100000_normalized_schema.sql`    | Normalized survey schema                 |
| `20260307100001_seed_survey_data.sql`     | Seed survey question data                |
| `20260307100002_submit_survey_rpc.sql`    | Survey submission RPC function           |
| `20260308_survey_behavior_and_status.sql` | Survey behavior tracking + status toggle |
| `20260310_scoring_result.sql`             | Scoring result storage                   |
| `20260314_admin_auth.sql`                 | Admin authentication tables              |
| `20260315_behavior_stats_rpcs.sql`        | Behavior statistics RPC functions        |

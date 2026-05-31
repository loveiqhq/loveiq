# Migration Rollback — LoveIQ Web

> Owner: Eman. The "I just ran a migration and want it gone" playbook.

This is **not** the same as `vercel rollback` (which only swaps the application
deployment). DB schema changes need their own reverse SQL or restore from PITR.

## Convention

For every non-trivial migration (data rewrites, column adds with backfill, table
renames, FK changes) write a paired rollback SQL **outside** `supabase/migrations/`
under `supabase/rollbacks/`. The standard migration runner never auto-applies these;
they're invoked manually only when needed.

File naming: same timestamp as the forward migration, suffixed `_down`.
Example: forward `20260514120000_v9_archetype_renames.sql` → rollback
`supabase/rollbacks/20260514120000_v9_archetype_renames_down.sql`.

## Decision tree

```text
Did the migration commit?
├── No → Stop the supabase CLI / abort the GitHub Action. No rollback needed.
└── Yes
    ├── Pure data rewrite (UPDATE statements only)?
    │   └── Run the paired _down.sql. Verify row counts.
    ├── Schema change (ADD COLUMN, CREATE INDEX, etc.)?
    │   ├── New column with NULL default → Run DROP COLUMN in _down.sql
    │   ├── New table → DROP TABLE
    │   └── Modified constraint → ALTER TABLE ... DROP/RECREATE the prior version
    └── Destructive (DROP COLUMN, DROP TABLE) with data loss?
        └── Restore from PITR. There is no SQL undo for lost rows.
```

## Apply a rollback

```bash
# 1. Verify the file exists and matches the migration you intend to revert.
ls supabase/rollbacks/

# 2. Dry-run by reading the SQL aloud. Confirm BEGIN/COMMIT is in place.

# 3. Apply against the live DB.
psql "$DATABASE_URL" -f supabase/rollbacks/<timestamp>_<name>_down.sql

# 4. Verify (run the migration's "WHERE" clauses as SELECT first).

# 5. Communicate: post outcome to ops Slack.
```

## Current rollback files

All paired files live in `supabase/rollbacks/` and share the forward migration's
timestamp with a `_down` suffix. CONCURRENTLY index drops run outside a
transaction (no `BEGIN/COMMIT`); everything else is wrapped.

| Forward migration                                        | Reverts                                           | Data loss on rollback?                         |
| -------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| `20260514120000_v9_archetype_renames.sql`                | 3 archetype display-name renames (data rewrite)   | No (idempotent reverse UPDATE)                 |
| `20260525120000_data_subject_request_log.sql`            | DROP TABLE (DSAR audit trail)                     | **Yes** — compliance trail; export first       |
| `20260525120100_system_flags.sql`                        | DROP TABLE (kill switches)                        | Flag state only; features fail-open to enabled |
| `20260525120200_scoring_result_config_sha.sql`           | DROP COLUMN + index (config SHA)                  | **Yes** — per-row config hash                  |
| `20260525120300_report_access_token_expires_at.sql`      | DROP COLUMN (token expiry)                        | Any ops-minted expiries become permanent       |
| `20260526120000_resend_webhook_event.sql`                | DROP TABLE (Resend idempotency)                   | Dedup history only; webhook fails-open         |
| `20260526120100_payment_unique_constraints.sql`          | DROP 2 partial UNIQUE indexes (CONCURRENTLY)      | No (re-opens duplicate-row race)               |
| `20260526120200_marketing_opt_in_terms_version.sql`      | DROP COLUMN (consent version)                     | **Yes** — Art. 7(1) consent evidence; export   |
| `20260526120300_app_user_processing_restricted_at.sql`   | DROP COLUMN + partial index (Art. 18 restriction) | **Yes** — restriction markers; export first    |
| `20260527120000_payment_personal_report_fk_set_null.sql` | FK SET NULL → RESTRICT                            | No (existing NULLs not restored)               |
| `20260527120100_pg_trgm_admin_search.sql`                | DROP trgm index (CONCURRENTLY; extension left)    | No (search falls back to seq scan)             |
| `20260527120200_dsar_cascade_fks.sql`                    | 18 FKs CASCADE → RESTRICT                         | No (cascade-deleted rows not restored)         |
| `20260527120300_slack_dead_letter.sql`                   | DROP TABLE (Slack DLQ)                            | Replay trail only; delivery unaffected         |

## Writing a new rollback

Mandatory elements:

1. Header comment: forward migration filename + purpose.
2. `BEGIN; ... COMMIT;` envelope.
3. Idempotent WHERE clauses (re-running the rollback on already-reverted rows must be a no-op).
4. Apply instructions in the header (`psql "$DATABASE_URL" -f ...`).

If the rollback can't be written (truly destructive forward migration), state so
explicitly in the forward migration's comment block: "ROLLBACK PATH: PITR restore only."

## Migration safety pre-checks

Before running any forward migration on prod, confirm:

- [ ] CREATE INDEX uses `CONCURRENTLY` (or table is < 1M rows).
- [ ] `ADD COLUMN NOT NULL` includes `DEFAULT <value>` or is preceded by a backfill.
- [ ] Long-running UPDATE statements are batched (`UPDATE ... WHERE id BETWEEN ...`).
- [ ] No `DROP COLUMN` on a column still read by deployed code.
- [ ] PR is reviewed by a second engineer (branch protection rule for
      `supabase/migrations/**` — see DR runbook section 7).

## Tested-against-prod-snapshot drill

Before merging a high-risk migration (data rewrite or FK change), run it against a
recent prod snapshot in a Supabase branch:

1. Restore PITR to a branch as of "yesterday".
2. Apply the forward migration. Capture row counts before and after.
3. Apply the rollback. Confirm row counts return to step-1 values.
4. Drop the branch. Attach the row-count diff to the PR description.

This is the loop the V9 migration **should have** run before being marked
"ready for staging." Future migrations of similar risk class must run it.

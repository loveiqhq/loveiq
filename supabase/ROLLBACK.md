# Supabase Migration Rollback Strategy

> Reference doc for reverting a bad migration. There are **no `*.down.sql`
> files** in this repo — Supabase's forward-only migration model is the
> source of truth. Rollback happens via either branch reset (preferred) or
> a hand-rolled compensating migration. This file documents both.

## When you need this

You've applied a migration to production (or staging) and discovered a
defect — a wrong column type, a constraint that breaks live writes, an
RPC that returns the wrong shape. Symptoms typically surface in:

- Failing requests in `npm run check` or the smoke-test step of CI
- 500s on routes that touch the affected tables
- Schema-drift contract tests starting to fail (`__tests__/contracts/`)
- The Supabase MCP `get_advisors` flagging the regression

## Preferred path — branch reset (Supabase Pro)

Supabase Pro projects expose branches. The recovery flow:

1. **Confirm the bad migration**: in the Supabase dashboard, identify the
   timestamped migration file that introduced the regression.
2. **Reset the branch to before that timestamp** using the MCP:

   ```text
   mcp__plugin_supabase_supabase__reset_branch
   ```

   This rolls the branch back to the previous migration head and discards
   all rows written after that point. Coordinate with the team — any
   manual rows added between the bad migration and the reset are lost.

3. **Re-create the migration correctly** with a new (later) timestamp.
   Never edit the file you reverted from; that breaks every developer
   who already applied it locally.
4. **Apply the new migration** with `mcp__plugin_supabase_supabase__apply_migration`.
5. **Verify** by running `mcp__plugin_supabase_supabase__list_migrations`
   and confirming the head is the new file.

## Fallback path — compensating migration

For environments without branches (free tier, hot prod where you can't
afford to lose data written since the bad migration):

1. **Write a new timestamped migration** that undoes the bad change.
   Examples:
   - Bad `ALTER TABLE ... ADD COLUMN x` → new migration with
     `ALTER TABLE ... DROP COLUMN x`
   - Bad `CREATE INDEX ix` → `DROP INDEX ix`
   - Bad `CREATE OR REPLACE FUNCTION f()` → revert by re-creating the
     previous version (you'll need the prior body from git history)
2. **Wrap in a transaction**: `BEGIN; … COMMIT;`. Test locally against a
   Supabase test branch before applying.
3. **Apply** via `mcp__plugin_supabase_supabase__apply_migration`.
4. **Document in the migration's leading comment** that this is a
   compensating rollback and reference the bad migration timestamp.

## Hard never-do

- **Never edit a migration file** that has already been applied to any
  environment. The migration timestamp is the unique identifier; mutating
  the contents creates divergence that Supabase can't reconcile.
- **Never delete a migration file** for the same reason. If you must
  unapply it, write a compensating migration instead.
- **Never run `DROP TABLE` without first confirming production has no
  dependent foreign keys** — Supabase's CASCADE will silently take
  associated tables with it.

## Disaster recovery (full restore)

If the schema is corrupted past recovery via migrations:

1. Restore the latest Supabase PITR (point-in-time recovery) snapshot.
2. Re-apply migrations from the snapshot's timestamp forward.
3. Validate with the smoke-test job (`/api/build-info` + Supabase
   health check at `/api/health`).

PITR is enabled on the production Supabase project. Verify via the
Supabase dashboard → Database → Backups.

## Validation after rollback

After any rollback action:

- `npm run typecheck` — catches schema-derived type drift in
  `features/admin/server/strategy/types.ts` and similar.
- `npm test` + `npm run test:integration` — exercises the affected
  RPC + REST paths.
- `__tests__/contracts/supabase-contracts.test.ts` — catches response
  shape drift before it reaches production.
- Hit `/api/health` and confirm Supabase + Resend + KV all report green.

# Disaster Recovery — LoveIQ Web

<!-- cspell:ignore pooler pgdump bypassrls sqzxwvwbsdgyxrlvvtye awfmcvpezgimfvaylcpp -->

> Owner: Eman + on-call. Source of truth for "the database is broken, what now."

This document covers Supabase database recovery, Vercel deployment rollback, and the
quarterly restore drill. For per-migration backout SQL, see [MIGRATION_ROLLBACK.md](./MIGRATION_ROLLBACK.md).

## Quick reference

| Scenario                    | First action                                                   | Time-to-recover (target) |
| --------------------------- | -------------------------------------------------------------- | ------------------------ |
| Bad migration in prod       | Apply matching `supabase/rollbacks/*.sql`                      | < 15 min                 |
| Bad code deploy             | `vercel rollback` to previous prod deployment                  | < 5 min                  |
| Data corruption (1 table)   | Restore a daily backup to a new project, copy the table back   | < 60 min                 |
| Catastrophic loss (full DB) | Daily backup to a new project; Supabase gone: weekly copy (§1) | < 4 h                    |
| Wrong nurture email sent    | `PATCH /api/admin/system-flags` set `nurture_sequence=false`   | < 1 min                  |
| Survey contamination        | `PATCH /api/admin/system-flags` set `survey_submissions=false` | < 1 min                  |

## 1. Where backups live

There are two, and they fail in different ways.

### Supabase's daily backups (inside Supabase)

Production (`pveqkhdpypfzxggwjsnk`, eu-central-2) is on Pro **without** the Point-in-Time
Recovery add-on (checked 2026-10-29: `pitr_enabled: false`). Supabase keeps one physical
backup a day for 7 days, so up to a day of writes can be lost.

- Dashboard → Database → Backups. A daily backup restores either **in place** (the project
  is unreachable meanwhile, and everything written after the backup is gone) or **to a new
  project**. A new project also gets the pg_cron jobs, which start running at once.
- They do not hold Storage files. LoveIQ stores none (0 buckets, 2026-10-29).
- They do not keep custom roles' passwords. After an in-place restore, reset
  `loveiq_backup`'s password (below), or the weekly copy fails.
- They live in the Supabase account, so they are lost with it.

### The weekly copy outside Supabase

`.github/workflows/db-backup.yml`, since 2026-10-29.

- **What:** `pg_dump --format=custom` of the `public` schema (every table, row, function,
  view and policy) and `supabase_migrations` (which migrations are applied). Beside each copy,
  a small `.cron.sql` file holds the live pg_cron jobs as `cron.schedule(...)` statements:
  the restored migration history would otherwise stop the migrations from recreating them.
- **Not in it:** staff sign-in accounts (`auth`: 5 staff, email magic link). No customer row
  points at them (`app_user.auth_user_id` is always empty), and staff sign in again after a
  restore; the allowlist `admin_users` is in `public`.
- **When:** Sundays at 03:41 UTC, started by Vercel's clock. Every dump is first restored into
  an empty Postgres 17 with pgvector, and the run fails if a table or its rows are missing.
- **Where:** the Vercel Blob store `loveiq-db-backups` (`store_su8rg2sP8Aia8d5P`): private,
  Frankfurt (fra1), connected to no Vercel project. Each copy is
  `db/<UTC time>_run-<GitHub run id>.pgdump.age`, about 126 MB.
- **Locked:** encrypted with [age](https://age-encryption.org) to the public key in the
  workflow. **The private key is only in Eman's macOS Keychain ("LoveIQ DB backup key (age)")
  and his password manager. Without it no copy can be opened.**
- **Kept 30 days** (four or five copies), because the privacy policy (§9) keeps a deleted
  account's data for at most 30 days. So a copy is at most a week old, and the oldest is a
  month old.
- **Watched:** a failed run posts to the brain channel. A week and a day without a run alerts
  the ops channel (the stall watchdog). Each run checks that the copy of every successful run
  in the last 28 days is still stored, because the token that stores a copy can also delete one.
- **Access:** the login `loveiq_backup` (read-only through `pg_read_all_data`, `BYPASSRLS` so
  pg_dump sees every row) through the session port of the pooler. GitHub secrets
  `BACKUP_DATABASE_URL` and `BACKUP_BLOB_READ_WRITE_TOKEN`; the store token is also in the
  Keychain ("LoveIQ DB backup Blob token"). Rotation: `docs/runbooks/SECURITY.md`.

### Restore the weekly copy

Done end to end on 2026-10-29 (drill log, §6): about 10 minutes from a laptop. You need
[age](https://github.com/FiloSottile/age/releases) and the PostgreSQL 17 client tools
(Postgres.app has them), and a new Supabase project in eu-central-2 as `$TARGET` (the
session URL of its pooler, port 5432, with the password in `PGPASSWORD`).

```bash
# 1. Pick a copy, then download it. Use curl: `vercel blob get` once saved a truncated file
#    and still printed "Success!". age refuses a damaged file, so a bad download cannot slip by.
export BLOB_READ_WRITE_TOKEN="$(security find-generic-password -s 'LoveIQ DB backup Blob token' -w)"
vercel blob list --prefix db/
COPY=db/<UTC time>_run-<id>
for f in pgdump.age cron.sql; do
  curl -fsS -H "Authorization: Bearer $BLOB_READ_WRITE_TOKEN" -o "copy.$f" \
    "https://su8rg2sp8aia8d5p.private.blob.vercel-storage.com/$COPY.$f"
done

# 2. Decrypt with the private key, straight from the Keychain (no key file on disk).
security find-generic-password -s 'LoveIQ DB backup key (age)' -w \
  | age -d -i - -o copy.pgdump copy.pgdump.age

# 3. Prepare the new project: the extensions prod has in public, and the two read-only
#    roles some tables are granted to (without them, ~100 grants fail).
psql "$TARGET" -c 'create extension if not exists vector with schema public' \
  -c 'create extension if not exists pg_trgm with schema public' \
  -c 'create role posthog_readonly nologin' -c 'create role claude_readonly nologin'

# 4. Restore everything but CREATE SCHEMA public, which every database already has.
#    Expect exactly 3 errors, "permission denied to change default privileges": harmless.
pg_restore --list copy.pgdump | grep -v -E '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public ' > restore.list
pg_restore --no-owner --use-list=restore.list -d "$TARGET" copy.pgdump

# 5. The pg_cron jobs, then let the data API see the tables.
psql "$TARGET" -c 'create extension if not exists pg_cron' -f copy.cron.sql
psql "$TARGET" -c "notify pgrst, 'reload schema'"
```

**Not on Eman's Mac** (the Keychain is only there): take the private key from his password
manager into a file and decrypt with `age -d -i key.txt -o copy.pgdump copy.pgdump.age`, then
delete `key.txt`. Take the store token from Vercel (Storage → `loveiq-db-backups`; the
dashboard's Browser tab also lists and downloads the copies).

Then §5 from step 4 (Vercel env, redeploy, webhooks). Also:

- Create `loveiq_backup` on the new project (`create role loveiq_backup login bypassrls`,
  `grant pg_read_all_data to loveiq_backup`, then `\password loveiq_backup` in psql, which sends
  only a hash) and update `BACKUP_DATABASE_URL`, or next Sunday's backup fails.
- Re-apply deletion requests that came in after the copy was taken (hello@ inbox): the restored
  `data_subject_request_log` only knows the earlier ones.
- Give `posthog_readonly` and `claude_readonly` logins again if PostHog or Claude needs them.
- Delete `copy.pgdump` when done: it is every customer's data, unencrypted.

## 2. Vercel deployment rollback

```bash
# List recent prod deployments
vercel ls --prod --scope=loveiq

# Rollback (instant — promotes the previous deployment back to prod alias)
vercel rollback <deployment-url> --scope=loveiq
```

The rollback is alias-only; no rebuild. Takes < 30 s to propagate via Vercel edge cache.
DB schema is **not** rolled back by `vercel rollback` — for that, see [MIGRATION_ROLLBACK.md](./MIGRATION_ROLLBACK.md).

## 3. Kill switches (instant feature disable)

Four flags in `system_flags` table. Toggle with curl (there is no screen for them):

```bash
curl -X PATCH https://loveiq.org/api/admin/system-flags \
  -H "Cookie: <admin-session>" \
  -H "X-CSRF-Token: <csrf>" \
  -H "Content-Type: application/json" \
  -d '{"key":"survey_submissions","enabled":false}'
```

| Flag                      | Effect when disabled                                                                                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `survey_submissions`      | `/api/survey` and `/api/survey-partial` return 503                                                                                                                                                                                                          |
| `nurture_sequence`        | `/api/cron/nurture-sequence` exits early                                                                                                                                                                                                                    |
| `report_paywall_enforced` | `/api/report` serves every owner report as `all_reports` (fully unlocked) — emergency comp-everyone switch (e.g. Stripe outage). Share-link viewers keep their gift view. Fail-secure: stays enforced if the flag row is absent or Supabase is unreachable. |
| `pay_to_start_checkout`   | `/api/stripe/pay-to-start` sells nothing: the `/sexual-archetype` page stays up and its buttons say checkout is paused. A checkout already open at Stripe can still be paid and is honoured. Fails open (a missing row means on).                           |

Propagation: up to 30 s across all Vercel instances (in-process cache TTL).

## 4. Data corruption — single table

1. Get the known-good rows from before the corruption: restore the last daily backup taken
   before it **to a new project** (§1; never in place, which throws away everything since), or,
   if it is older than 7 days, decrypt a weekly copy (§1) and restore just that table into a
   scratch database: `pg_restore --data-only --table=<table> -d <scratch> copy.pgdump`.
2. From the live DB, take a temporary dump of the affected table:
   `pg_dump --table=<table> --data-only > affected.sql`
3. From the restored copy, dump the known-good rows:
   `pg_dump --table=<table> --data-only > recovered.sql`
4. Diff, decide which rows to replace, apply via psql.
5. Delete the new project or scratch database, and any decrypted copy.

## 5. Catastrophic loss — full DB

If the live Supabase project is destroyed or unreachable for an extended outage:

1. **Communicate**: post incident to ops Slack.
2. **Flip kill switches**: set `survey_submissions=false` (via admin) **only** if a
   read-replica is responsive. If write path is dead, skip — site already 5xxing.
3. **Restore the newest daily backup to a new project** (Supabase UI; new project = new ref).
   If the Supabase account itself is gone or locked, restore **the weekly copy** (§1) into a
   new Supabase project instead, or into any Postgres 17 with pgvector.
4. **Update Vercel env vars** to point at the new project's URL + service role key.
5. **Redeploy** so the new vars take effect.
6. **Reconfigure Stripe webhook URL** if the project URL changed.
7. **Reconfigure Resend webhook URL** likewise.

Target RTO: 4 hours. Target RPO: 24 hours from a daily backup (PITR is not enabled), up to
7 days from the weekly copy alone.

## 6. Quarterly restore drill

Schedule: **first Friday of every calendar quarter**, owner Eman.

Goal: prove the restore path works under low-stakes conditions before a real incident.

Drill steps (alternate between the two kinds of backup in §1):

1. Restore the newest weekly copy (§1, "Restore the weekly copy") or a daily backup into a new,
   temporary Supabase project in eu-central-2.
2. Compare it with live: the count of tables, functions, policies, indexes and constraints,
   and every table's rows. Live may only be ahead by rows written since the backup.
3. Through the data API with the new project's keys: the service-role key sees the same counts
   as the database; the anon key sees no rows.
4. Record the outcome in the drill log below (date, what was restored, timings, anomalies).
5. Delete the temporary project and every decrypted file.

### Drill log

| Date       | Branch                                                                                                          | Outcome    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-09-04 | _not run_                                                                                                       | _skipped_  | First scheduled drill (first Friday of Q3 2026). Not run; the 2026-10-29 drill below is the first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-29 | weekly copy `db/2026-10-29T2108Z_run-40954830931` into temporary project `sqzxwvwbsdgyxrlvvtye` (deleted after) | **passed** | Download 126 MB with curl in 30 s (the Vercel CLI once truncated it; age refused the file), decrypt from the Keychain in under a second, restore from a laptop in 7 min. Identical to live: 97 tables, 98 functions, 86 policies, 314 indexes, 300 constraints, 7 triggers; 92 tables with identical rows, 5 ahead in live by 71 rows written after the copy. Data API counts matched, the anon key saw no rows, two functions returned the same rows as live. Found and fixed: grants to `posthog_readonly`/`claude_readonly` need those roles first; the pg_cron jobs were in no backup. Then the commands of §1 "Restore the weekly copy", run word for word on a second temporary project (`awfmcvpezgimfvaylcpp`, deleted after) with `db/2026-10-29T2132Z_run-40958302873`: 7.5 min, exactly the 3 expected errors, the decrypted dump's SHA-256 equal to the one the backup run logged, the 3 pg_cron jobs identical to live, every object count identical. |

## 7. Branch protection — required GitHub rule

Set in **GitHub → Settings → Branches → Branch protection rules** for `main`:

- Require **2 approving reviews** for changes touching:
  - `proxy.ts`
  - `features/scoring/**`
  - `supabase/migrations/**`
  - `app/api/admin/**`
- Require status checks: `ci`, `security`, `codeql`
- Require linear history
- Restrict force pushes
- Restrict deletion

(This rule is GitHub-side and cannot be enforced via code in this repo.
F-19 from the audit lives here as a documented operational requirement.)

## 8. Escalation contacts

- Supabase support: dashboard → Support (Pro plan = 1 business day SLA)
- Vercel support: dashboard → Help (Pro plan = email, response within 24 h)
- Stripe support: dashboard → Get help (24/7 chat for live-mode issues)
- Resend support: status.resend.com + <support@resend.com>

## 9. Retention policy — audit trails

These tables grow forever **by design**:

| Table                      | Why retained                                                                                     | Notes                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `data_subject_request_log` | GDPR Art. 17(3)(b) — compliance retention. Survives DSR-delete of the same email.                | F‑01. Anon read-blocked via RLS.                                   |
| `admin_action_log`         | Forensic trail of every admin action. Required when investigating a destructive op months later. | R‑19. Manual purge only if Supabase storage cost becomes material. |
| `cron_run`                 | Operational forensics — answers "when did this cron last succeed?" for incident triage.          | Cleanup script can be added if rows exceed ~10M.                   |

These tables are explicitly EXCLUDED from the `/api/cron/purge-old-data` cron (F‑02).
If a retention horizon ever becomes necessary (e.g., 7-year SOX requirement somewhere),
add a separate purge cron that operates on tier-defined cutoffs rather than the
fast 30/180/365-day tiers in F‑02.

## 10. The company brain — what comes back, and the 14 rows that do not

The brain is 28,087 rows in `brain_chunk` in the same database, so both backups in §1 cover it
and sections 4 and 5 apply unchanged. What a restore does not tell you is which of it would
have come back on its own, and under pressure that is the only part worth deciding.

**Almost all of it rebuilds itself.** Every source but one is a copy of something
upstream — Drive, Gmail, Slack, WhatsApp, Notion, the calendar, GA4, Search Console,
Clarity, the shipped report copy, the glossary, the repo docs. Delete the lot and the
hourly crons put it back within a day for the price of some API calls. Do not spend
restore time on those rows.

**The exception is `source = 'decision'`,** and only part of it:

| decision rows                                            | count | if the table is lost                                                                    |
| -------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------- |
| mined from transcripts (`meta.origin = 'mined'`)         | 91    | re-derivable — re-run `brain-mine`; costs model quota and some days of its daily budget |
| written by hand via `record_decision` (no `meta.origin`) | 14    | **gone.** No upstream holds them                                                        |

Those 14 are the ones a person deliberately wrote down, which is why they are the best
evidence about what they decide, and why they are the only brain rows needing thought.
Small enough to export in one request — this exact command was run on 2026-09-22 and
returned 14:

```bash
curl -s "$SUPABASE_URL/rest/v1/brain_chunk?source=eq.decision&meta->>origin=is.null&select=source_id,title,body,meta,first_seen_at" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" > decisions.json
```

`is.null` is load-bearing and the obvious spelling is wrong: the hand-written rows carry
no `origin` key at all, so `not.eq.mined` matches none of them — SQL drops NULLs from a
negated comparison. The first version of this runbook entry shipped with that filter and
returned zero rows, which reads exactly like "there is nothing to back up".

**Nothing deletes them in normal operation** — checked 2026-09-22: `decision` is the one
source with no ingest module, and therefore no sweep. The exposure is a bad restore or
corruption older than the backups in §1 reach (7 days of daily backups, 30 days of weekly
copies), not a runaway cron.

## 11. Known gaps (TODO)

- **One person holds the key to the weekly copies**: the age private key is only with Eman
  (Keychain and password manager). If both are lost, the copies cannot be opened. A second
  key, held by someone else, would be a second `-r` recipient in `db-backup.yml`.
- **Up to a day of writes can be lost**: PITR is off. The add-on would bring that down to
  minutes; it is a cost decision.
- **No incident comms template**: status-page integration would help during long
  outages. Currently incident updates are ad-hoc on Slack.

# Disaster Recovery — LoveIQ Web

> Owner: Eman + on-call. Source of truth for "the database is broken, what now."

This document covers Supabase database recovery, Vercel deployment rollback, and the
quarterly restore drill. For per-migration backout SQL, see [MIGRATION_ROLLBACK.md](./MIGRATION_ROLLBACK.md).

## Quick reference

| Scenario                    | First action                                                   | Time-to-recover (target) |
| --------------------------- | -------------------------------------------------------------- | ------------------------ |
| Bad migration in prod       | Apply matching `supabase/rollbacks/*.sql`                      | < 15 min                 |
| Bad code deploy             | `vercel rollback` to previous prod deployment                  | < 5 min                  |
| Data corruption (1 table)   | Restore from PITR to a branch, copy table                      | < 60 min                 |
| Catastrophic loss (full DB) | Restore Supabase PITR snapshot to new project                  | < 4 h                    |
| Wrong nurture email sent    | `PATCH /api/admin/system-flags` set `nurture_sequence=false`   | < 1 min                  |
| Survey contamination        | `PATCH /api/admin/system-flags` set `survey_submissions=false` | < 1 min                  |

## 1. Where backups live

Supabase Pro plan includes **Point-In-Time Recovery (PITR) with a 7-day retention window**.
Backups are managed by Supabase and live in the same region as the project.
There is **no off-Supabase backup** in this repo today.

- Dashboard: `https://supabase.com/dashboard/project/<project-id>/database/backups`
- Restore is via Supabase UI (Database → Backups → Restore to point in time).
- Restoring goes to a **new branch**, not the live project. You then:
  1. Verify the restored snapshot is healthy (row counts, recent timestamps).
  2. Decide whether to promote the branch (full cutover) or copy specific rows.

**Gap**: no automated backup verification cron exists. The quarterly drill below
is the manual substitute.

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

Three flags in `system_flags` table. Toggle via admin UI or curl:

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

Propagation: up to 30 s across all Vercel instances (in-process cache TTL).

## 4. Data corruption — single table

1. Restore PITR snapshot to a Supabase branch as of the timestamp before corruption.
2. From the live DB, take a temporary dump of the affected table:
   `pg_dump --table=<table> --data-only > affected.sql`
3. From the branch, dump the known-good rows:
   `pg_dump --table=<table> --data-only > recovered.sql`
4. Diff, decide which rows to replace, apply via psql.
5. Drop the branch.

## 5. Catastrophic loss — full DB

If the live Supabase project is destroyed or unreachable for an extended outage:

1. **Communicate**: post incident to ops Slack.
2. **Flip kill switches**: set `survey_submissions=false` (via admin) **only** if a
   read-replica is responsive. If write path is dead, skip — site already 5xxing.
3. **Restore PITR** to a new Supabase project (Supabase UI; new project = new ref).
4. **Update Vercel env vars** to point at the new project's URL + service role key.
5. **Redeploy** so the new vars take effect.
6. **Reconfigure Stripe webhook URL** if the project URL changed.
7. **Reconfigure Resend webhook URL** likewise.

Target RTO: 4 hours. Target RPO: 5 minutes (PITR granularity).

## 6. Quarterly restore drill

Schedule: **first Friday of every calendar quarter**, owner Eman.

Goal: prove the restore path works under low-stakes conditions before a real incident.

Drill steps:

1. Pick a timestamp 24 h in the past.
2. Restore PITR to a new branch.
3. Pick 3 tables (e.g. `survey_submission`, `personal_report`, `app_user`).
4. Run row-count comparison: branch vs live. Note any expected new rows in live.
5. Run a sample query on the branch (e.g. recent submissions for a known test user).
6. Record outcome in the drill log section below (date, branch ref, anomalies).
7. Drop the branch.

### Drill log

| Date       | Branch  | Outcome     | Notes                                                                                                                                              |
| ---------- | ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-04 | _to do_ | _scheduled_ | First scheduled drill (first Friday of Q3 2026). Owner: Eman. Run the 7-step procedure above; record actual restore latency for use as a baseline. |

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
- Resend support: status.resend.com + support@resend.com

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

## 10. Known gaps (TODO)

- **No off-Supabase backup**: PITR is the only path. If Supabase itself loses the
  region, recovery depends on Supabase's own DR. Mitigation: nightly `pg_dump` to S3
  is a sensible follow-up if regulatory or contractual requirements demand it.
- **No automated backup verification**: the drill is manual. Could be automated via
  a weekly cron that restores to a branch and asserts row counts.
- **No incident comms template**: status-page integration would help during long
  outages. Currently incident updates are ad-hoc on Slack.

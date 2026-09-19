# Staging database

## Why

`staging.loveiq.org` and `www.loveiq.org` are two Vercel projects pointed at **one**
Supabase project. Anything staging writes lands in real production data — real
submissions, real price quotes, real analytics. A second database separates them.

## Why it is free

Supabase bills **per organization**, and plans cannot be mixed inside one:

| Option                         | Cost                    | Why not                                                        |
| ------------------------------ | ----------------------- | -------------------------------------------------------------- |
| Second project in the Pro org  | ~$10/mo                 | Each project is its own compute instance                       |
| Preview branch                 | $0.01344/hr (~$9.81/mo) | Not covered by the Spend Cap; compute credits do **not** apply |
| **Separate Free organization** | **$0**                  | What we use                                                    |

Free-plan limits and the two that actually bite:

- **500 MB database.** Production is 438 MB, but **291 MB of that is the brain
  corpus**. Staging carries only the schema and the seed the migrations ship, which
  is a few MB.
- **Pauses after 7 days of low activity.** Resumed with one click from the
  dashboard; the data survives (90-day window). Staging is used in bursts, so
  expect this.
- No downloadable backups. Irrelevant — staging holds nothing worth restoring.

## Why staging gets no production data

The migrations seed the entire survey themselves — **132 question inserts, 197
answer options, 66 mappings**, the survey row, system flags and the admin
allowlist — so the app works with zero user rows. Copying real submissions would
double the GDPR footprint of intimate survey answers for no benefit.

## Setup

**1. Create the organization and project** (dashboard only — no API does this):
[supabase.com/dashboard](https://supabase.com/dashboard) → new **organization**, plan
**Free** → new project inside it. Region `eu-central-1` to match production.

**2. Collect three values** from the new project:

| From               | Value                                                    |
| ------------------ | -------------------------------------------------------- |
| Connect → URI      | `STAGING_DB_URL`                                         |
| Project URL        | `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`              |
| `service_role` key | `STAGING_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` |
| `anon` key         | `NEXT_PUBLIC_SUPABASE_ANON_KEY`                          |

**3. Dry run, then apply:**

```bash
export STAGING_DB_URL='postgresql://postgres:PW@db.REF.supabase.co:5432/postgres'
export STAGING_SERVICE_ROLE_KEY='eyJ...'
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY stay pointed at PRODUCTION — read-only,
# used only to fetch the object inventory to compare against.

node scripts/setup-staging-db.mjs            # dry run
node scripts/setup-staging-db.mjs --apply    # apply + verify parity
```

The script refuses to run if `STAGING_DB_URL` resolves to production's project ref,
if the ref cannot be parsed, or if either credential is missing — it exits 2 rather
than guessing. After applying it compares functions, tables, columns, constraints
and indexes against production, and asserts staging holds **0** submissions,
reports, payments and users.

**4. Point the staging site at it.** On the Vercel project `loveiq-staging` only
(NOT `loveiq-web`), set the four variables from step 2, then redeploy. No code
changes — the app reads these by name.

**5. Confirm the separation.** Submit a survey on staging and check the row count
in production has not moved.

## Keeping it in step

`supabase/migrations/` is the single source of truth, and CI enforces both
directions on every push:

- **repo → live**: `npm run check:migration-drift` fails if production lacks
  anything a migration declares.
- **live → repo**: the same job fails if production has a function or table no
  migration creates. That direction was unchecked until 2026-09-20, when it turned
  out `supabase db push` into an empty database **failed outright** — five
  functions and four tables existed only in production. Captured in
  `20260307095959_objects_that_predate_the_migration_history.sql`.

Re-run step 3 after merging migrations to bring staging forward.

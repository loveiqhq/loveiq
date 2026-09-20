# Staging database

**Status: live since 2026-09-20.** `staging.loveiq.org` has its own Supabase
database, separate from production.

Before that, both sites pointed at one Supabase project, so everything staging
wrote landed in real production data — real submissions, real price quotes, real
analytics.

|                  | production             | staging                 |
| ---------------- | ---------------------- | ----------------------- |
| Supabase project | `pveqkhdpypfzxggwjsnk` | `slgljpyszkmdieuvhkto`  |
| Supabase org     | the Pro org            | a **separate Free org** |
| Region           | eu-central-2 (Zurich)  | eu-central-2 (Zurich)   |
| Vercel project   | `loveiq-web`           | `loveiq-staging`        |
| Real data        | yes                    | **none**                |

## Why it is free, and what that costs us

Supabase bills **per organization** and plans cannot be mixed inside one:

| Option                         | Cost                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Second project in the Pro org  | ~$10/mo — each project is its own compute instance                                |
| Preview branch                 | $0.01344/hr — **not** covered by the Spend Cap, **not** offset by compute credits |
| **Separate Free organization** | **$0** ← what we use                                                              |

The Free plan's 500 MB is ample: production is 438 MB, but 291 MB of that is the
brain corpus, which staging does not carry.

The one real cost: **free projects pause after 7 days of low activity.** Resuming
is one click and the data survives (90-day window). Staging is used in bursts, so
expect this.

## What staging has, and what it deliberately does not

Verified on creation — schema parity against production:

|             |           |
| ----------- | --------- |
| Functions   | 81 / 81   |
| Tables      | 87 / 87   |
| Columns     | 913 / 913 |
| Constraints | 254 / 254 |
| Indexes     | 289 / 289 |

It carries the reference data the migrations seed — 66 questions, 259 answer
options, the survey row, system flags, the admin allowlist — so the app works.
It carries **no** submissions, reports, payments, users, sessions or events, and
should not: copying real survey answers into a second environment doubles the
GDPR footprint of intimate data for no benefit.

**It still shares production's Resend and Slack credentials.** Accepted, not an
oversight. A survey submitted on staging writes to the staging database but sends
a REAL email and posts to the REAL Slack channel. Stripe IS separate — staging is
on `sk_test` / `pk_test`.

So **verify staging with `/api/health`**, which is ungated and whose `supabaseOk`
probe proves the database link, rather than by submitting a test survey.

## Getting the credentials

Stored on Vercel as **Config, not Secret**, deliberately, so they can be read
back:

```bash
vercel env pull .env.stg --environment=preview --project loveiq-staging --scope loveiq --yes
```

Use the Vercel **CLI**. `VERCEL_TOKEN` is scoped to `loveiq-web` and returns
`Project not found` for `loveiq-staging` — which reads like a deleted project and
is not.

## Keeping it in step after merging migrations

From a checkout that has them:

```bash
export STAGING_DB_URL='postgresql://postgres:PW@db.slgljpyszkmdieuvhkto.supabase.co:5432/postgres'
export STAGING_SERVICE_ROLE_KEY=...        # from the env pull above
node scripts/setup-staging-db.mjs --apply  # pushes, then proves parity vs production
```

The script exits 2 rather than guessing if `STAGING_DB_URL` resolves to
production's project ref, if the ref cannot be parsed, or if a credential is
missing. The database password is not stored in the repo; reset it in the
Supabase dashboard if nobody has it.

Env changes only reach NEW deployments:

```bash
vercel ls loveiq-staging --meta githubCommitRef=staging --scope loveiq   # find it
vercel redeploy <that url> --scope loveiq                                # no --yes flag
```

## Three differences from production that are PRODUCTION's

Found by the first rebuild, and worth keeping in view:

- `email_suppression.id` exists in staging and **not** in production — production's
  table was never built from its own migration.
- 6 `answer_option` rows (Q01003, Q16011, Q16012) exist in production and in no
  migration.
- The `admin_users` allowlist has been hand-edited in production — two added, two
  offboarded removed — never through a migration.

## Why this was hard

`supabase db push` into an empty database had never been attempted, and it
**failed**. Six separate problems, none of which production could notice because
production applied each migration as it was written. See
`20260307095959_objects_that_predate_the_migration_history.sql` and the
`check:migration-order` / `check:migration-drift` CI jobs, which now guard both
directions.

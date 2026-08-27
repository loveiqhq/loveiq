# Company Brain — runbook

> Ask a question in Slack, get an answer from LoveIQ's own documentation, git
> history and business numbers, with a link to every source.

## For everyone: how to use it

Mention `@LoveIQ Brain` in a channel it has been invited to, or send it a direct
message. It replies in a thread, and every answer lists the sources it used.

**It is good at** (all measured against the real corpus):

| Ask                                                        | Why it works                                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| "how are we doing this month"                              | The funnel rollup carries visits, signups, revenue and ad spend per day, week and month |
| "how much did we spend on Google Ads and what did we earn" | Spend and revenue sit in the same chunk, already divided, so nothing has to be computed |
| "why did we stop the dark landing page test"               | Every commit is indexed, including the plain-English `For Marcus:` summary              |
| "why is the data retention purge turned off"               | `CLAUDE.md` records deliberately-deferred work and the reason                           |
| "what does `STRIPE_COUPON_100` do"                         | The whole environment-variable table is indexed                                         |

**It is weak at, and will say so rather than guess:**

- **Anything only in code.** Only markdown is indexed — no `.ts`, no SQL
  migrations, no CSVs. "What are the 14 archetypes" returns styling commits, not
  the archetype definitions.
- **Current state assembled from many changes.** The price of the report exists
  only as a chain of dated commits across two A/B arms and a feature flag. It
  cannot reliably replay that into "the price right now".
- **People and money outside the product.** No HR data, no payroll, no bank
  balance, no runway. It should decline these; if it ever answers one, that is a
  bug worth reporting.
- **Follow-up questions.** Each question is answered on its own. "Is that good or
  bad?" has no memory of what came before — repeat the subject.

**When it is wrong:** say so in the thread and tell whoever maintains this. Every
question and the answer it gave are recorded in the `brain_query` table, so a
wrong answer can be found again and diagnosed. That only works if someone reports
it — there is no automatic feedback signal.

## For operators

### What feeds it

| Source                                    | Where from                                                             | When                    |
| ----------------------------------------- | ---------------------------------------------------------------------- | ----------------------- |
| Repo docs + git commits                   | `.github/workflows/brain-ingest.yml` → `scripts/brain-ingest-repo.mjs` | on every push to `main` |
| Funnel numbers, GA4, Search Console, Jira | `/api/cron/brain-ingest`                                               | daily, 04:47 UTC        |

Both are idempotent and both sweep rows they did not rewrite, guarded by the
write count **of their own source** so an empty run can never wipe a source.

### Environment variables

Required for it to answer at all: `BRAIN_LLM_KEY`,
`SLACK_BRAIN_SIGNING_SECRET`, `SLACK_BRAIN_BOT_TOKEN`.

Strongly recommended: `BRAIN_LLM_REASONING_EFFORT=low` (measured 13.7s → 1.7s)
and `SLACK_BRAIN_TEAM_ID` (without it, any workspace that installs the app can
read revenue, ad spend and every internal doc).

Per-source, each one freezing that source when unset: `JIRA_BASE_URL`,
`JIRA_EMAIL`, `JIRA_API_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `GA4_PROPERTY_ID`,
`SEARCH_CONSOLE_SITE`.

**Leaving one unset does NOT alert, and that is deliberate.** Jira is knowingly
unconfigured; a daily "SKIPPED jira" would train everyone to ignore the ops
channel and take the real alerts down with it. What DOES alert, once per source
per day, is a source that is configured and still produced nothing — a revoked or
expired Google credential (`google-token-unavailable`), a run that exhausted its
time budget, or a run that wrote zero rows. New failure kinds alert by default;
only the four "we chose not to configure this" cases are silent.

The practical consequence: after the first nightly run, check
`select source, count(*) from brain_chunk group by source` yourself. A source you
believe you configured but that is missing there will not page you.

See the environment-variable table in `CLAUDE.md` for what each one does and what
happens when it is missing.

### Slack app setup, in two phases

The order matters: Slack verifies the Request URL the moment you save it, and the
route answers that check only once the signing secret is live in the deployed
build.

1. <https://api.slack.com/apps> → Create New App → From an app manifest → paste
   `docs/runbooks/slack-brain-manifest.yaml`.
2. Copy the **Signing Secret** (Basic Information) and the **Bot User OAuth
   Token** (Install App). Set both on Vercel and **redeploy**.
3. Event Subscriptions → Enable Events → Request URL
   `https://www.loveiq.org/api/slack/events`. It should read "Verified"
   immediately; if not, the secret is not live in the running deployment.
4. Subscribe to bot events `app_mention` and `message.im` → Save. Reinstall if
   asked. Then `/invite @LoveIQ Brain`.

### Smoke test before telling anyone it exists

```bash
npm run brain:ask "how are we doing this month"   # exercises the real answer path
npm run brain:battery                             # 25 adversarial questions
```

The battery reads its expected figures out of the corpus at run time, so it does
not go stale, and it refuses to run without `BRAIN_LLM_KEY` rather than reporting
25 misleading failures. It is deliberately **not** part of `npm run check`: it
makes real model and database calls.

### Checking it is still alive

```sql
select source, count(*), max(period_end) from brain_chunk group by source;
select count(*), max(created_at) from brain_query;
```

If a source's `max(period_end)` is stale, that source has stopped. A failed,
skipped or zero-row ingest raises a Slack ops alert once per source per day —
but a source that was **never configured** looks identical to one that broke, so
check `jira` is non-zero after the first nightly run.

### Known limitations, deliberately accepted

- **No embeddings.** Retrieval is Postgres full-text plus trigram fuzzy matching.
  Paraphrases that share no words with the corpus will not match. Adding
  a pgvector embedding column is the upgrade path.
- **No relevance floor.** Scores are not comparable between questions, so the
  pipeline cannot tell "we have this" from "we don't" — declining honestly is a
  property of the prompt, not something the search can enforce.
- **Revenue is attributed to report-creation date, not payment date**, and
  refunds are excluded rather than netted. Harmless while there are zero refunds;
  revisit at the first one.
- **`idx_brain_chunk_body_trgm`** is 7.6 MB and unused since the search rewrite.
  Left in place because the database is at 146 MB of a 500 MB budget and
  rebuilding the index takes seconds if fuzzy body matching is ever wanted.

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

| Source                                 | Where from                                                             | When                    |
| -------------------------------------- | ---------------------------------------------------------------------- | ----------------------- |
| Repo docs + git commits                | `.github/workflows/brain-ingest.yml` → `scripts/brain-ingest-repo.mjs` | on every push to `main` |
| GA4, call notes, funnel numbers, Slack | `/api/cron/brain-fast`                                                 | every 15 min            |
| Notion (board + pages)                 | `/api/cron/brain-notion`                                               | hourly, at :41          |
| Search Console                         | `/api/cron/brain-ingest`                                               | daily, 04:47 UTC        |

Jira is **not** a source. Notion is the system of record for the team's work
(decision 2026-08-28), so `ingestJira` is no longer called by the cron and `jira`
has been removed from the `list_sources` list. The ingester file and its tests are
kept — the 1,037 issues in `loveiq.atlassian.net` are real and actively updated, so
re-enabling it later means wiring the call back and setting `JIRA_*`, not rewriting
it. Do not add `jira` back to the source list before chunks exist: naming a source
with zero rows tells the model to search something that cannot answer.

Both are idempotent and both sweep rows they did not rewrite, guarded by the
write count **of their own source** so an empty run can never wipe a source.

### Environment variables

Required for it to answer at all: `BRAIN_LLM_KEY`,
`SLACK_BRAIN_SIGNING_SECRET`, `SLACK_BRAIN_BOT_TOKEN`.

Strongly recommended: `BRAIN_LLM_REASONING_EFFORT=low` (measured 13.7s → 1.7s)
and `SLACK_BRAIN_TEAM_ID` (without it, any workspace that installs the app can
read revenue, ad spend and every internal doc).

Per-source, each one freezing that source when unset: `NOTION_TOKEN`,
`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_OAUTH_REFRESH_TOKEN`, `GA4_PROPERTY_ID`, `SEARCH_CONSOLE_SITE`. The
`JIRA_*` trio still exists in code and is deliberately left unset. Slack reads use
`SLACK_BRAIN_BOT_TOKEN`.

`GOOGLE_SERVICE_ACCOUNT_KEY` is preferred over the `GOOGLE_OAUTH_*` trio and
should replace it. A Workspace reauth policy invalidates a user refresh token
every few weeks — it failed on 2026-08-28 with `invalid_grant / invalid_rapt` —
and while it is dead GA4 and Search Console simply stop advancing, with an ops
alert but no data loss. A service account has no user session and never re-authenticates.

The external gateway reads credentials that already exist for other reasons:
`STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `POSTHOG_API_KEY`, and `SLACK_BRAIN_BOT_TOKEN`
(falling back to `SLACK_BOT_TOKEN`). `GITHUB_TOKEN` is optional — the repository is
public, so GitHub reads work without it and a token only raises the rate limit.

Verified live against production on 2026-08-28: Stripe returns the balance,
charges and disputes; Resend returns the verified `loveiq.org` domain; GitHub
returns the repo and open pull requests; PostHog returns project 244778 with its
insights. Slack lists channels and reads history — see below.

PostHog is on the **EU** host. The same key is rejected by the US host with
`authentication_failed`, which says nothing about the region, so it is an easy
hour to lose.

`LOVEIQ_MCP_TOKEN` gates the MCP endpoint rather than a source: unset means
`/api/mcp` returns 503 and no Claude can connect, which is why it is safe to
deploy before the token exists.

**Both Google credentials are now in place** (2026-08-28). Two things were needed
and neither is obvious:

- Search Console is a **separate grant** from GA4. The `ga4-reader` service
  account was a Viewer on the GA4 property but not a user on
  `sc-domain:loveiq.org`, so it read analytics and 403'd search. Added as a Full
  user; Search Console went from frozen at 23 August to current.
- The refresh token must come from the project's **own** Desktop OAuth client
  (`brain-cli`, `824530086559-lchl…`), never from `gcloud auth
application-default login`. Google refuses gcloud's shared client the sensitive
  `analytics.readonly` scope outright — "This app tried to access sensitive
  info… Google blocked this access". Google also no longer lets you download an
  existing client's secret, so restoring this means adding a second secret to the
  same client rather than recreating it.

**Leaving one unset does NOT alert, and that is deliberate.** A daily "SKIPPED"
line for a source nobody intends to configure would train everyone to ignore the
ops channel and take the real alerts down with it. What DOES alert, once per source
per day, is a source that is configured and still produced nothing — a revoked or
expired Google credential (`google-token-unavailable`), a run that exhausted its
time budget, or a run that wrote zero rows. New failure kinds alert by default;
only the four "we chose not to configure this" cases are silent.

The practical consequence: after the first nightly run, check
`select source, count(*) from brain_chunk group by source` yourself. A source you
believe you configured but that is missing there will not page you.

See the environment-variable table in `CLAUDE.md` for what each one does and what
happens when it is missing.

### Connecting Claude to it (the MCP endpoint)

This is the primary way to use the brain. `/api/mcp` exposes the corpus as an MCP
server, so Claude — the claude.ai app, Claude Desktop, or Claude Code — can search
it as a tool and reason across it alongside the live connectors it already has.

Add it as a custom connector with:

- **URL** `https://www.loveiq.org/api/mcp`
- **Authorization** `Bearer <LOVEIQ_MCP_TOKEN>`

**Use `www`, not the apex.** `loveiq.org` 308-redirects to `www`, and a redirect
drops the `Authorization` header, so the apex presents as a confusing 401 with a
token that is perfectly valid.

Six tools, in two halves.

**History — the indexed corpus:**

| Tool                     | For                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `search_company_context` | Anything written down — a decision, a commit, a Notion page or database row, a past month's numbers |
| `get_business_numbers`   | Exact daily funnel/revenue/ad-spend rows to compute with                                            |
| `list_sources`           | What the corpus holds and how fresh each source is — call this first when an answer looks stale     |

**Live state — read at ask time, full history, no lag:**

| Tool                     | For                                                                                                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_product_tables`    | Every table, view and analysis function in our database, with its columns                                                                                                                                                                                              |
| `query_product_data`     | Read any of them: payments, refunds, Resend delivery, Calendly bookings, submissions, answers, reports, shares, invites, waitlist, marketing spend, admin tables. Prefer an `rpc/get_*` function when one fits — they encode the business logic already                |
| `query_external_service` | Read-only GET against nine outside services — Stripe, Resend, Slack, GitHub, PostHog, Vercel, Figma, Trustpilot, Clarity — for what they know and we do not store: dispute detail, payout timing, a Slack thread, an open pull request, a runtime error, a design file |

**Read-only by construction, not by validation.** A table read is a GET, a
function call is a POST to `/rpc`, and PostgREST needs PATCH/PUT/DELETE to write.
The external gateway is GET-only against a fixed host registry — a tool taking an
arbitrary URL would be an SSRF hole, since the deployment can reach the Supabase
service-role endpoint and cloud metadata addresses. Table names must match an
anchored identifier pattern and exist in the live schema. Every one of these is
mutation-tested: removing any single guard fails a specific test.

**Two things the tools say out loud.** A capped result reports how many rows MATCH,
not just how many came back — a truncated answer that does not admit it reads as
the whole picture. And an unconfigured service answers "this credential is unset,
do not conclude the data does not exist" rather than returning an empty list,
because a model cannot tell those apart.

**One shared token for the whole team, so it is the whole corpus.** There is no
per-person scoping, by policy: revenue, ad spend and every internal document sit
behind this one string. Requests are rate-limited to 120/minute per IP to bound how
fast a leaked token could drain it. Rotate by changing the value in both Vercel
projects — no code change, and the next deployment picks it up.

**Unset token means 503, not open.** Verified against a live deployment:
`{"error":"Not configured."}` with no token configured, `401` for a missing, wrong
or off-by-one-character bearer, `200` only for an exact match (constant-time
compared).

**The nightly refresh only runs on production.** `isProdCronHost()` checks
`NEXT_PUBLIC_SITE_URL` against `https://(www.)?loveiq.org`, so a staging or preview
deployment serves the MCP endpoint happily but never re-ingests — the corpus there
is frozen at whatever production last wrote. Reading a stale corpus from staging is
fine; concluding a source has died from it is not.

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

**MEASURED 2026-08-28: the free tier is not viable for a team tool.** A full
25-question run, paced 16s apart, degraded monotonically as it went:

| Probe position | Latency            |
| -------------- | ------------------ |
| first five     | 3.5 – 4.1 s        |
| middle         | 7 – 11 s           |
| later          | 23 – 38 s          |
| last three     | 45 s, then timeout |

Thirteen answers were correct. Of the eight flagged, **seven were latency or
timeout, and none was a content problem** — the answers themselves were right,
including the honest declines ("The provided sources do not contain information
about Ferhad's pay"). The 3.5s figure is what this system actually costs when the
provider is not throttling; the 45s figure is the provider, not the code.

So the decision to take before telling the team it is theirs is a commercial one:
**a paid tier, or accept that the fifth person to ask a question today waits 40
seconds.** Nothing in the code will fix that.

**The DAILY request cap is a separate limit and also easy to hit.** Measured 2026-08-28: a handful of ad-hoc questions plus roughly two and a
half battery runs exhausted it, after which every request — including a two-character
one — returns `429 You exceeded your current quota`. Two consequences:

- Run the battery **once** and let it finish. Two concurrent runs rate-limit each
  other into uselessness; one earlier run produced three lines of output before
  giving up. `BRAIN_BATTERY_GAP_MS` paces it (default 12s); the run takes ~6
  minutes.
- `DAILY_QUESTION_LIMIT` in `features/brain/server/log.ts` is 220, chosen against
  an assumed 250/day. That assumption is **unverified** — the real ceiling has not
  been measured, and if it is lower the guard never fires and people just see
  "something went wrong" instead of an honest "out of questions for today".
  Measure it before telling the team the tool is theirs, or move to a paid tier.

### Which services are actually reachable

Do not keep this list in your head, and do not trust a description — ask
`list_sources`. It reports both halves: how many chunks each indexed source holds
and how fresh it is, AND which outside services have a credential on this
deployment right now. The live half is computed from `process.env` at request
time, so it cannot drift.

Reachable with credentials that already exist for other reasons: Stripe, Resend,
PostHog, Slack (subject to scopes, below). GitHub needs no credential at all
because the repository is public. Registered and waiting on one env var each:
`VERCEL_TOKEN`, `FIGMA_TOKEN`, `TRUSTPILOT_API_KEY`, `CLARITY_API_TOKEN` — Trustpilot takes its key as a query parameter rather than a
header, and Figma uses its own header, which is why the gateway supports four auth
shapes.

**How this list was arrived at:** every external hostname the application talks to
was enumerated from the source and checked against coverage, rather than recalled.
That sweep is what found Microsoft Clarity — live on the site via
`public/clarity-init.js` and completely invisible to the brain — and confirmed
Google Ads needs no separate integration, because GA4 exposes `advertiserAdCost`
once the accounts are linked. Re-run that sweep when a new dependency is added.

**The distinction that matters:** an unreachable service is a MISSING CREDENTIAL,
not an absence of data. Both the tool and `list_sources` say so explicitly, because
a model cannot otherwise tell them apart and will answer "we have no record of
that" when the truth is "nobody gave me a key".

### Slack conversations — indexed, and readable live

Enabled 2026-08-28. The **LoveIQ Brain** app holds
`app_mentions:read, chat:write, im:write, im:history, im:read, channels:history,
channels:read, channels:join, users:read` and is a member of all 9 public channels.

Reads use `SLACK_BRAIN_BOT_TOKEN` first and fall back to `SLACK_BOT_TOKEN`,
deliberately: adding read scopes to the main bot would force a reinstall of the app
that posts the live journey messages, which `CLAUDE.md` says not to risk.

Two things this buys, and they are different:

- **Live** — `query_external_service` with `service: "slack"` calls any read method
  (`conversations.list`, `conversations.history`, `users.list`).
- **Indexed** — `ingestSlack` writes one chunk **per channel per day**, so
  `search_company_context` finds the exchange, not an isolated line. ~517 chunks
  cover 2025-10-29 → present.

The nightly pass is **incremental**: `conversations.history` is asked for `oldest`
= the earliest day still needing work (today, which is still accruing, plus any day
recorded incomplete). A full re-walk of all nine channels takes **266 seconds**
against the cron's 38-second budget, so before this the nightly reached one channel
of nine, wrote nothing, and still reported success. It now finishes in **~6s**.

Three traps live here, all of which produced silence rather than errors:

- `oldest` must be Slack's `seconds.microseconds` string. A bare integer is refused
  with `invalid_ts_oldest` — for the WHOLE channel, logged only as a warning.
- Day ids for a long day are `…:DAY#2`, `…:DAY#3`. Feeding that raw third segment
  to `Date.parse` yields `NaN`, with the same silent effect.
- A day rewritten shorter orphans its extra parts on an old builder version. Those
  orphans used to be touched every run (so they never expired) AND counted as
  "needs work" (so the fetch bound was dragged back months, the walk never
  finished, and `complete: false` blocked the very sweep that would have removed
  them). The ingester now recognises a stale part of a current day and lets the
  sweep take it.

`Retry-After` is honoured on a 429 but **never past the run's deadline** — one
rate-limited thread could otherwise consume the whole budget. A deferred thread is
recorded as a gap and repaired next run.

Three design choices worth knowing before changing it:

1. **Bot messages are excluded**, which is what makes joining _every_ public channel
   safe. `#commits-prod-staging` and `#prod-alerts` are almost entirely machine
   output and the commits are already indexed from git. Filtering on **authorship**
   rather than a channel allow-list means a human comment in an alerts channel is
   still kept and a new bot channel needs no configuration. Join/leave messages
   carry a real `user`, so they are filtered by `subtype` separately.
2. **A day is one chunk.** A single Slack message is usually meaningless alone
   ("yeah agreed"); the unit that answers a question is the exchange around it.
   `period_end` is the day, so recency ranking works.
3. **Thread replies are fetched separately** — they do not appear in
   `conversations.history`, and a thread is usually where the actual argument
   happens. `conversations.replies` is Tier 3 (~50/min) and the first live run
   tripped it a dozen times, so the ingester honours `Retry-After` and records
   `meta.threadsComplete: false` on any day whose replies it could not fetch. That
   flag is load-bearing: a past day is otherwise skipped forever once indexed, so
   without it one 429 would silently truncate a chunk permanently. Bumping
   `SLACK_BUILDER_VERSION` is how you force every day to be rebuilt.

`users:read` is what turns an opaque `<@U…>` id into `Marcus Börner`, in the author
position **and** inside message text — a message about someone is only findable by
their name if the name is in the indexed text. Without the scope it degrades to raw
ids rather than failing.

Private channels additionally need `groups:read` + `groups:history`; decide that
separately, since it widens what one shared token can reach.

### Google auth on production is keyless

Production stores no Google credential at all. Vercel signs an OIDC token for every
deployment into `VERCEL_OIDC_TOKEN`; Google trades that for a token of its own
through a Workload Identity Pool, and that token impersonates `ga4-reader`, which is
what actually holds GA4 Viewer, Search Console Full and any shared Drive folders.

**Why it is built this way.** Every credential-holding alternative is broken or
blocked: a refresh token carrying the sensitive analytics scopes dies to a Workspace
reauth policy every few weeks, a downloadable service-account key is refused by
`constraints/iam.disableServiceAccountKeyCreation`, and gcloud impersonation needs a
CLI that serverless does not have. There is nothing here to rotate, leak, or
re-consent, which is the only arrangement that can actually stay in sync.

What exists, all on project `loveiq-brain`:

| Piece               | Value                                                                       |
| ------------------- | --------------------------------------------------------------------------- |
| Pool                | `vercel` (global)                                                           |
| Provider            | `vercel-oidc`, issuer `https://oidc.vercel.com/loveiq`                      |
| Allowed audience    | `https://vercel.com/loveiq`                                                 |
| Attribute condition | subject must start `owner:loveiq:project:loveiq-web:environment:production` |
| Binding             | `ga4-reader` grants `roles/iam.workloadIdentityUser` to that one subject    |

The condition is the security boundary: a PREVIEW deployment, a different project or
another team gets a token STS will refuse, so this cannot be borrowed by anything
else in the account.

Two env vars on production only — `GOOGLE_WORKLOAD_IDENTITY_AUDIENCE` and
`GOOGLE_IMPERSONATE_SERVICE_ACCOUNT`. Neither is a secret: one is a resource path,
one an email.

**Proved with a real token, not just unit tests.** `vercel env pull
--environment=development` yields a genuine Vercel OIDC token, and its claims match
the provider exactly (`iss https://oidc.vercel.com/loveiq`, `aud
https://vercel.com/loveiq`, `sub owner:loveiq:project:loveiq-web:environment:development`).
Presented to the production provider it is REFUSED with `unauthorized_client` —
which alone is ambiguous, since a wrong audience gives the same error. So a
temporary second provider with the environment condition relaxed was created, the
same token federated successfully through it, and the provider was deleted. That
discriminates: the issuer, the audience and the exchange are all correct, and the
production provider refuses a development deployment specifically because of its
environment condition. Use that technique rather than relaxing the real provider.

**Diagnosing it.** A 400 from STS means configuration, not a bad token — a
mismatched audience, an `aud` claim the provider does not allow, or a subject the
attribute condition rejects; the log names all three. A 403 from
`generateAccessToken` almost always means the missing
`roles/iam.serviceAccountTokenCreator` or `workloadIdentityUser` binding. If
federation fails the code falls back to the refresh token and still impersonates, so
a stale pool config degrades to the previous path rather than to no access.

### Backfilling Google without a working refresh token

The `GOOGLE_OAUTH_*` refresh token dies periodically to a Workspace reauth policy
(`invalid_grant / invalid_rapt`) and a fresh `gcloud auth login` does NOT revive it —
it is a separate credential from gcloud's own. Two other routes exist, and only one
of them currently works:

- **A service-account key is blocked by org policy** —
  `constraints/iam.disableServiceAccountKeyCreation` on `loveiq-brain`. The two keys
  `ga4-reader` already has are `SYSTEM_MANAGED` and cannot be downloaded. Lifting
  that policy is an org-admin decision.
- **Impersonation works**, needs no key, and is how a local backfill gets done:

```bash
export GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token \
  --impersonate-service-account=ga4-reader@loveiq-brain.iam.gserviceaccount.com \
  --scopes=https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/webmasters.readonly \
  2>/dev/null)
npm run brain:backfill-google
```

**Three traps in that one command.** `--scopes` is REQUIRED — without it the token
carries only `cloud-platform` and both APIs answer "Request had insufficient
authentication scopes". Both scopes must be passed together, comma-separated; a
token with one reaches only its own API. And gcloud prints
"`--scopes` flag may not work as expected and will be ignored for account type
impersonated_account" — that warning is **misleading**, the flag does take effect,
and the warnings go to stdout, so `2>/dev/null` alone is not enough if you are
capturing output (use `| tr -d '[:space:]'` and check the token starts `ya29.`).

`getGoogleAccessToken()` checks `GOOGLE_OAUTH_ACCESS_TOKEN` first precisely so this
works, and it is a laptop convenience only — a serverless function has no gcloud.

**The nightly refresh still needs a real credential.** Until one exists, GA4 and
Search Console keep the history that was backfilled — a run with no usable token
returns `skipped: google-token-unavailable`, writes nothing, and therefore does not
sweep — but they stop advancing. Fixing it means either re-running the browser OAuth
flow for the `brain-cli` client to mint a fresh refresh token, or an org-policy
exception so a downloadable service-account key can be created.

### Gemini call notes, via Drive

The notes Gemini writes after each call arrive as an email, but that email is only a
notification — the note itself is a Google Doc, and a Doc exports to clean text.
Parsing the mail body would mean guessing at HTML Google can change at will, for a
worse result. So the ingester reads Drive.

**Live since 2026-08-28:** the folder is shared and 23 notes (105 chunks) are
indexed, back to 7 August. A dedicated cron re-checks every 15 minutes
(`/api/cron/brain-fast`, at 7/22/37/52 past), so a note written after a call is
searchable within minutes rather than the next morning. The nightly `brain-ingest`
also ingests Drive — deliberate redundancy, so a failure of the fast job degrades to
daily rather than to nothing.

**Scope is controlled by SHARING, not by configuration.** It indexes every Google
Doc the service account can see, and it can see nothing by default. To switch it on,
share the folder those notes land in with

```text
ga4-reader@loveiq-brain.iam.gserviceaccount.com
```

as **Viewer**. That is deliberately the same shape as the Notion integration: the
boundary is what somebody chose to share, visible and revocable in Drive itself,
rather than an env var nobody remembers setting. Nothing else is needed — the Drive
API is already enabled on `loveiq-brain`, and the credential is the one GA4 and
Search Console use.

Until something is shared the source reports `drive-nothing-shared` and is skipped,
so the ops alert does not fire nightly for a source nobody has enabled. A FAILED
listing reports `drive-list-failed` instead — the two are deliberately different,
because "nobody shared anything" and "Drive refused us" need different responses.

**Why three jobs at three speeds rather than one.**
That job crawls all 35 Notion databases and both Google properties and costs ~30s a
run; at 15-minute intervals it would burn an hour of compute a day re-reading things
that change daily at most, and hit Notion's rate limit for nothing. Drive is the
opposite shape — ONE list call, and content is fetched only for documents whose
`modifiedTime` moved, so a run with nothing new is a single HTTP request.

Gemini notes are titled `Meeting notes: …` rather than `Drive: …`, because the
title feeds the trigram index and is half of what `brain_search` matches on.
Measured before that change: "action items from our recent meetings" ranked a
dependency-bump commit above the actual notes, and they appeared at all only because
retrieval reserves slots per source. After it, "what was decided in the meeting
about mobile" returns notes at ranks 1 and 2.

**Google Meet uses SHORTCUTS for meetings you did not organise.** In the LoveIQ
`Google Meet` folder, one series holds 23 real documents and three others hold
nothing but shortcuts — one of which points at a video. A query for documents alone
therefore finds 23 of 24 available notes, so the ingester follows shortcuts: it
fetches the TARGET's metadata (the shortcut's own `modifiedTime` tracks the pointer,
not the note, so using it would mean an edited note never looks changed), skips
non-document targets, and skips targets it cannot read.

An unreadable target is NORMAL, not a fault: the note lives in the organiser's own
Drive and they have not shared their folder. The run logs `shortcutsUnreachable` so
the gap is visible without paging anyone. As of 2026-08-28 that count is 2 — the
Kick Off Call and the Eman/Mark attribution call — and closing it means each
organiser sharing their own `My Drive > Google Meet` folder with the service
account, exactly as above.

Share the PARENT `Google Meet` folder rather than an individual meeting folder:
Drive access is inherited, so one share covers every existing series and every
future one Gemini creates. The listing query is global (`mimeType='document' or
shortcut`, no parent filter), so no code change is needed when a new meeting folder
appears.

Only native Google Docs are indexed. A PDF or a scan would need OCR, and silently
indexing an empty body would be worse than skipping it.

### Notion: after changing the chunk shape, rebuild

The nightly ingest is incremental — it skips any page whose `last_edited_time` AND
`BUILDER_VERSION` both match what is indexed. That is what keeps 1,000+ pages
inside a 45-second cron: a page's content costs ~1.9s, because Notion paginates
nested block children and rate-limits to roughly 3 requests a second, so one run
buys about 24 pages.

The consequence: **bumping `BUILDER_VERSION` marks every page stale at once**, and
the nightly job alone would need ~45 nights to work through them. Nothing is lost
while it converges — every page is either rewritten or confirmed, so the sweep
stays safe and un-rebuilt rows keep their older content — but the new shape does
not arrive until it finishes.

So whenever you change how a Notion row is built — the title format, which
properties go in the body, what lands in meta — bump `BUILDER_VERSION`, deploy,
then run:

```bash
npm run brain:rebuild-notion
BUDGET_MS=120000 npm run brain:rebuild-notion   # shorter passes
```

Measured on the real workspace: 1,062 pages converge in 4 passes. Safe to
interrupt and safe to re-run — an interrupted pass leaves every page either
rewritten or confirmed, and on a finished corpus it detects convergence in one
pass and exits.

**Why the version stamp exists at all.** Without it, a change to row construction
is invisible to the incremental check: the pages did not change, so they are
touched forever and the old shape survives. That is not hypothetical — one version
shipped with every database title reading "Untitled database", and another cut 67
long pages off at 2,400 characters. Neither would ever have self-corrected.

### GA4 and Search Console: depth vs freshness

The nightly job reads only the **last 10 days** of GA4 and Search Console and
confirms everything older with a touch. It is not a 10-day corpus — depth comes
from a one-off backfill and then persists, because each night's touch tells the
sweep the older chunks are still current.

```bash
npm run brain:backfill-google          # 480 days, Search Console's API limit
npm run brain:backfill-google -- 200   # shallower
```

**Why not simply widen the nightly window.** The Search Console `date x query`
report is one row per query per day; over 16 months that is tens of thousands of
rows against a 15-second paging budget, and a truncated report is not an error —
so a wide nightly window would quietly lose the query breakdown for arbitrary
days. 10 days is chosen because GA4 finalises in ~48h and Search Console lags ~2
days and can still revise: anything inside that window may change and must be
re-read.

Run the backfill again whenever the chunk shape changes, or after an outage longer
than the window.

**The guard that matters here:** if the run cannot list what already exists, it
touches nothing and reports only what it wrote. `sweepStale` then sees a small run
against a large source and refuses a majority deletion, so the history survives a
bad read rather than being deleted by it. Mutation-tested four ways.

### Checking it is still alive

```sql
select source, count(*), max(period_end) from brain_chunk group by source;
select count(*), max(created_at) from brain_query;
```

If a source's `max(period_end)` is stale, that source has stopped. A failed,
skipped or zero-row ingest raises a Slack ops alert once per source per day —
but a source that was **never configured** looks identical to one that broke, so
read the counts yourself after the first nightly run rather than trusting silence.

Expect eight sources with rows — `doc`, `commit`, `analytics`, `ga4`, `gsc`,
`notion`, `drive`, `slack`. Easier than SQL: call
`list_sources` through the MCP endpoint, which prints the same thing per source
and additionally names any source present in the table that the tool does not
know about.

### Three ingest jobs, at three speeds

Each source is refreshed as fast as its upstream actually changes — which is not
the same as "as fast as possible".

| Job            | Every   | Sources                      | Measured           |
| -------------- | ------- | ---------------------------- | ------------------ |
| `brain-fast`   | 15 min  | ga4, drive, analytics, slack | ~12s in production |
| `brain-notion` | hourly  | notion                       | ~29s in production |
| `brain-ingest` | nightly | gsc                          | seconds            |

- **Slack, the funnel numbers and call notes change continuously** and are all
  cheap. Slack only became cheap once its pass stopped re-walking all history
  (266s to ~4s); before that the nightly reached one channel of nine, wrote
  nothing, and reported success.
- **GA4 is here because it serves INTRADAY data.** Probed live on 2026-08-29 it
  returned 45 sessions for that same morning, so a nightly-only GA4 left "how many
  visitors today" unanswerable until the next night. Its window now ends at `today`
  rather than `yesterday`. Today's row is partial by nature and is labelled
  `TODAY SO FAR, still accruing`, so a running total is never read as a closed day.
- **Notion is hourly, not 15-minute, because it costs ~29s a run whether or not
  anything changed** — it enumerates all 35 databases to find what moved. Every 15
  minutes that is ~50 minutes of compute a day re-reading unchanged pages, against
  Notion's rate limit, for nothing. Hourly is still 24x fresher than nightly. The
  cheap alternative, a `/search`-by-last-edited crawl, can never notice a DELETED
  page, and the sweep depends on knowing the full set.
- **Search Console stays nightly because it genuinely lags.** Probed on 2026-08-29,
  its newest available day was 2026-08-26 — three days back. Asking every 15 minutes
  would refetch identical numbers 96 times a day. For GSC alone, nightly IS live.

`brain-fast` replaced `brain-drive`, which ran call notes by themselves. Its
15-minute slots (`7,22,37,52`) are unchanged, so the cadence is the one already
proven in production.

### A cron that stops firing now alerts

Every alert in the cron routes lives inside the route body, so the one failure
nobody heard about was the route never being entered — a cron never invoked, 401ing,
hitting the non-prod gate, or hard-killed at `maxDuration` writes no `cron_run` row
and says nothing.

`features/cron/server/cron-stall.ts` holds a max-age per cron and is called from
`anomaly-watcher` (hourly, thousands of runs), so it watches from OUTSIDE the crons
it checks. It is wrapped in its own try/catch: monitoring that can take down what it
monitors is worse than none. A test keeps the watch list in step with `vercel.json`,
because an unwatched cron looks exactly like a healthy one.

It found `chapter-nudge` dead since 2026-07-25 on its first run. That cron is
**retired** (decision 2026-08-29) and is listed in `UNWATCHED_CRONS`; its
`vercel.json` entry and route still exist and can be removed when convenient.

A source that has never run cannot be distinguished from one deployed minutes ago,
so that case says so in the alert text rather than asserting a fault — `brain-ingest`
showed zero runs for exactly that reason on 2026-08-28, and fired normally at
04:47 the next morning.

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
